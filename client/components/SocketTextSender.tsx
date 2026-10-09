"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import io from "socket.io-client";

/**
 * 自動判定 Socket.IO Server 連線位址
 * 1. 優先使用環境變數 NEXT_PUBLIC_SOCKET_SERVER_URL
 * 2. 本機環境 (localhost / 127.0.0.1) -> http://localhost:8080
 * 3. 線上正式環境 -> http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com
 */
export const getSocketServerUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8080";
    }
  }

  return process.env.NODE_ENV === "development"
    ? "http://localhost:8080"
    : "http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";
};

export interface SocketTextSenderProps {
  onSendSuccess?: (data: { text: string; timestamp: number }) => void;
  onSendError?: (error: string) => void;
  showStatusIndicator?: boolean;
}

/**
 * 元件：SocketTextSender
 * 負責維護與 Socket.IO 伺服器的連線，並提供符合 10-200 字數規則的發送功能
 */
export function SocketTextSender({
  onSendSuccess,
  onSendError,
  showStatusIndicator = false,
}: SocketTextSenderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    setCurrentUrl(targetUrl);

    const socket = io(targetUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(`[SocketTextSender] 連線成功: ${targetUrl} (Socket ID: ${socket.id})`);
      setIsConnected(true);
    });

    socket.on("disconnect", (reason: string) => {
      console.log(`[SocketTextSender] 連線中斷: ${reason}`);
      setIsConnected(false);
    });

    socket.on("connect_error", (err: Error) => {
      console.warn(`[SocketTextSender] 連線失敗 (${targetUrl}):`, err.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 傳送文字方法（嚴格驗證 10 - 200 字限制）
  const sendText = useCallback(
    (textToSend: string): Promise<{ success: boolean; message: string }> => {
      return new Promise((resolve, reject) => {
        const trimmed = textToSend ? textToSend.trim() : "";
        const length = trimmed.length;

        // 規則檢驗：限制 10 - 200 字
        if (length < 10 || length > 200) {
          const errMsg = `字數不符合規則，限制為 10 - 200 字 (目前輸入：${length} 字)`;
          onSendError?.(errMsg);
          return reject(new Error(errMsg));
        }

        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          const errMsg = `Socket.IO 尚未連線至伺服器 (${currentUrl})`;
          onSendError?.(errMsg);
          return reject(new Error(errMsg));
        }

        const payload = {
          text: trimmed,
          length,
          timestamp: Date.now(),
        };

        socket.emit("submit_text", payload, (response?: { success?: boolean; message?: string }) => {
          console.log("[SocketTextSender] 伺服器確認收到:", response);
          onSendSuccess?.(payload);
          resolve({
            success: true,
            message: response?.message || "文字已成功透過 Socket 傳送至伺服器",
          });
        });

        // 避免無回呼時卡住
        setTimeout(() => {
          resolve({ success: true, message: "文字已送出至伺服器" });
        }, 1200);
      });
    },
    [currentUrl, onSendError, onSendSuccess]
  );

  if (!showStatusIndicator) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono bg-white/80 backdrop-blur border border-stone-200 shadow-sm text-stone-600 select-none">
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"
        }`}
      />
      <span>{isConnected ? "Socket Connected" : "Connecting..."}</span>
      <span className="text-[10px] text-stone-400 max-w-[160px] truncate" title={currentUrl}>
        {currentUrl}
      </span>
    </div>
  );
}

/**
 * 自訂 Hook：useSocketTextSender
 * 方便任何 React 元件直接進行連線狀態檢查與文字傳送
 */
export function useSocketTextSender() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    setServerUrl(targetUrl);

    const socket = io(targetUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      console.log(`[useSocketTextSender] 已連線至: ${targetUrl}`);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const sendText = useCallback(
    (textToSend: string): Promise<{ success: boolean; message: string }> => {
      return new Promise((resolve, reject) => {
        const trimmed = textToSend ? textToSend.trim() : "";
        const length = trimmed.length;

        // 規則檢驗：10 - 200 字
        if (length < 10 || length > 200) {
          return reject(
            new Error(`字數限制為 10 - 200 字 (目前輸入：${length} 字)`)
          );
        }

        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          return reject(new Error(`伺服器尚未連線 (${serverUrl})`));
        }

        const payload = {
          text: trimmed,
          length,
          timestamp: Date.now(),
        };

        socket.emit("submit_text", payload, () => {
          resolve({ success: true, message: "文字已成功透過 Socket 送出" });
        });

        setTimeout(() => {
          resolve({ success: true, message: "文字已成功透過 Socket 送出" });
        }, 1200);
      });
    },
    [serverUrl]
  );

  return { isConnected, serverUrl, sendText };
}

export default SocketTextSender;
