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

/**
 * 取得或生成手機/瀏覽器專屬的持久性 UUID
 * 優先讀取 localStorage，若不存在則生成並寫入
 */
export const getOrCreateUUID = (): string => {
  if (typeof window === "undefined") return "";

  const STORAGE_KEY = "aphasia_user_uuid";
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        id = crypto.randomUUID();
      } else {
        id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "temp-" + Math.random().toString(36).substring(2, 11);
  }
};

/**
 * Client 端共享 Socket 單例（Singleton）
 * 確保同一個分頁只會建立 1 條 Socket 連線，避免重複連線算錯人數
 */
let sharedSocket: SocketIOClient.Socket | null = null;

export const getSharedSocket = (): SocketIOClient.Socket => {
  if (!sharedSocket || sharedSocket.disconnected) {
    const targetUrl = getSocketServerUrl();
    const userUUID = getOrCreateUUID();

    sharedSocket = io(targetUrl, {
      query: {
        uuid: userUUID,
        role: "client",
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return sharedSocket;
};

export interface SocketTextSenderProps {
  onSendSuccess?: (data: { uuid: string; text: string }) => void;
  onSendError?: (error: string) => void;
  showStatusIndicator?: boolean;
}

/**
 * 元件：SocketTextSender
 * 負責維護與 Socket.IO 伺服器的連線，並將 localStorage 的 UUID 回傳給 Server
 */
export function SocketTextSender({
  onSendSuccess,
  onSendError,
  showStatusIndicator = false,
}: SocketTextSenderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [uuid, setUuid] = useState("");
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    const userUUID = getOrCreateUUID();
    setCurrentUrl(targetUrl);
    setUuid(userUUID);

    // 取得全域共享的單一 Socket 實例
    const socket = getSharedSocket();
    socketRef.current = socket;
    setIsConnected(socket.connected);

    const onConnect = () => {
      console.log(`[SocketTextSender] 連線成功: ${targetUrl} (UUID: ${userUUID})`);
      setIsConnected(true);
    };

    const onDisconnect = (reason: string) => {
      console.log(`[SocketTextSender] 連線中斷: ${reason}`);
      setIsConnected(false);
    };

    const onConnectError = (err: Error) => {
      console.warn(`[SocketTextSender] 連線失敗 (${targetUrl}):`, err.message);
      setIsConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
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

        const socket = socketRef.current || getSharedSocket();
        if (!socket || !socket.connected) {
          const errMsg = `Socket.IO 尚未連線至伺服器 (${currentUrl})`;
          onSendError?.(errMsg);
          return reject(new Error(errMsg));
        }

        const userUUID = uuid || getOrCreateUUID();
        const payload = {
          uuid: userUUID,
          text: trimmed,
        };

        socket.emit("submit_text", payload, (response?: { success?: boolean; message?: string }) => {
          console.log("[SocketTextSender] 伺服器確認收到:", response);
          onSendSuccess?.(payload);
          resolve({
            success: true,
            message: response?.message || "文字已成功透過 Socket 傳送至伺服器",
          });
        });

        setTimeout(() => {
          resolve({ success: true, message: "文字已送出至伺服器" });
        }, 1200);
      });
    },
    [currentUrl, onSendError, onSendSuccess, uuid]
  );

  if (!showStatusIndicator) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono bg-white/90 backdrop-blur border border-stone-200 shadow-sm text-stone-600 select-none">
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"
        }`}
      />
      <span>{isConnected ? "Socket Connected" : "Connecting..."}</span>
      {uuid && (
        <span className="text-[10px] text-stone-500 font-mono" title={uuid}>
          [{uuid.slice(0, 8)}]
        </span>
      )}
      <span className="text-[10px] text-stone-400 max-w-[140px] truncate" title={currentUrl}>
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
  const [userUUID, setUserUUID] = useState("");
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    const id = getOrCreateUUID();
    setServerUrl(targetUrl);
    setUserUUID(id);

    // 取得全域共享的單一 Socket 實例
    const socket = getSharedSocket();
    socketRef.current = socket;
    setIsConnected(socket.connected);

    const onConnect = () => {
      setIsConnected(true);
      console.log(`[useSocketTextSender] 已連線至: ${targetUrl} (UUID: ${id})`);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
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

        const socket = socketRef.current || getSharedSocket();
        if (!socket || !socket.connected) {
          return reject(new Error(`伺服器尚未連線 (${serverUrl})`));
        }

        const currentId = userUUID || getOrCreateUUID();
        const payload = {
          uuid: currentId,
          text: trimmed,
        };

        socket.emit("submit_text", payload, () => {
          resolve({ success: true, message: "文字已成功透過 Socket 送出" });
        });

        setTimeout(() => {
          resolve({ success: true, message: "文字已成功透過 Socket 送出" });
        }, 1200);
      });
    },
    [serverUrl, userUUID]
  );

  return { isConnected, serverUrl, sendText, userUUID };
}

export default SocketTextSender;
