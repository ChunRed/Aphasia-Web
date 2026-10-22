"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import io from "socket.io-client";

/**
 * 訊息記錄資料結構規格 (MessageLog)
 */
export interface MessageLog {
  id: string;          // 該筆訊息的唯一 ID (可用 uuid 或 nanoid 生成)
  userId: string;      // 傳送者的 UUID
  originalText: string;// 觀眾輸入的完整日記內容 (>= 10 字)
  keywords: string[];  // Gemini API 分析出的 3~5 個關鍵字
  timestamp: number;   // 建立時間戳記
}

/**
 * 自動判定 Socket.IO Server 連線位址
 * 1. 優先使用環境變數 NEXT_PUBLIC_SOCKET_SERVER_URL
 * 2. 本機環境 (localhost / 127.0.0.1) -> http://localhost:8080
 * 3. 線上正式環境 -> http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com
 */
export const getSocketServerUrl = (): string => {
  let url = "";

  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryServer = params.get("server") || params.get("socketUrl");
      if (queryServer && queryServer.trim().length > 0) {
        return queryServer.trim();
      }
    } catch {
      // ignore
    }
  }

  if (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL) {
    url = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
  }

  if (typeof window !== "undefined") {
    const { hostname, protocol, port } = window.location;

    if (port === "8080") {
      return window.location.origin;
    }

    if (url && (url.includes("localhost") || url.includes("127.0.0.1"))) {
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        url = url.replace(/localhost|127\.0\.0\.1/g, hostname);
      }
    }

    if (!url) {
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        url = "http://localhost:8080";
      } else if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith(".local")) {
        url = `http://${hostname}:8080`;
      } else if (protocol === "https:") {
        url = "https://2026daf.nosidehere.space";
      } else {
        url = "http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";
      }
    }

    if (protocol === "https:" && url.startsWith("http://")) {
      if (
        !url.includes("localhost") &&
        !url.includes("127.0.0.1") &&
        !/^(?:http:\/\/)?(?:\d{1,3}\.){3}\d{1,3}/.test(url)
      ) {
        if (url.includes("elasticbeanstalk.com")) {
          url = "https://2026daf.nosidehere.space";
        } else {
          url = url.replace(/^http:\/\//i, "https://");
        }
      }
    }
  } else {
    if (!url) {
      url =
        process.env.NODE_ENV === "development"
          ? "http://localhost:8080"
          : "https://2026daf.nosidehere.space";
    }
  }

  return url;
};

/**
 * 取得或生成手機/瀏覽器專屬的持久性 UUID (userId)
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
        userId: userUUID,
        uuid: userUUID, // 相容舊參數
        role: "client",
      },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return sharedSocket;
};

export interface SocketTextSenderProps {
  onSendSuccess?: (data: { userId: string; text: string; id?: string }) => void;
  onSendError?: (error: string) => void;
  showStatusIndicator?: boolean;
}

/**
 * 元件：SocketTextSender
 * 負責維護與 Socket.IO 伺服器的連線，並將 localStorage 的 UUID / userId 回傳給 Server
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
      console.log(`[SocketTextSender] 連線成功: ${targetUrl} (User ID: ${userUUID})`);
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

  // 傳送文字方法（嚴格驗證 10 - 200 字限制，帶入 userId 與 text）
  const sendText = useCallback(
    (textToSend: string): Promise<{ success: boolean; message: string; id?: string }> => {
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
        // 依照規格帶上 userId: string, text: string，並附加相容欄位
        const payload = {
          userId: userUUID,
          text: trimmed,
          originalText: trimmed,
          uuid: userUUID,
        };

        socket.emit("submit_text", payload, (response?: { success?: boolean; message?: string; id?: string; userId?: string }) => {
          console.log("[SocketTextSender] 伺服器確認收到:", response);
          onSendSuccess?.({
            userId: userUUID,
            text: trimmed,
            id: response?.id,
          });
          resolve({
            success: true,
            id: response?.id,
            message: response?.message || "文字已成功加入排程佇列",
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
  const [userId, setUserId] = useState("");
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    const id = getOrCreateUUID();
    setServerUrl(targetUrl);
    setUserId(id);

    // 取得全域共享的單一 Socket 實例
    const socket = getSharedSocket();
    socketRef.current = socket;
    setIsConnected(socket.connected);

    const onConnect = () => {
      setIsConnected(true);
      console.log(`[useSocketTextSender] 已連線至: ${targetUrl} (User ID: ${id})`);
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
    (textToSend: string): Promise<{ success: boolean; message: string; id?: string }> => {
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

        const currentId = userId || getOrCreateUUID();
        const payload = {
          userId: currentId,
          text: trimmed,
          originalText: trimmed,
          uuid: currentId,
        };

        socket.emit("submit_text", payload, (response?: { success?: boolean; message?: string; id?: string }) => {
          resolve({
            success: true,
            id: response?.id,
            message: response?.message || "文字已成功加入排程佇列",
          });
        });

        setTimeout(() => {
          resolve({ success: true, message: "文字已成功透過 Socket 送出" });
        }, 1200);
      });
    },
    [serverUrl, userId]
  );

  // 專門發送 SUBMIT_DIARY 事件至 Server 端排程佇列
  const submitDiary = useCallback(
    (textToSend: string): Promise<{ success: boolean; message: string; id?: string }> => {
      return new Promise((resolve, reject) => {
        const trimmed = textToSend ? textToSend.trim() : "";
        const length = trimmed.length;

        if (length < 10 || length > 200) {
          return reject(new Error(`字數限制為 10 - 200 字 (目前輸入：${length} 字)`));
        }

        const socket = socketRef.current || getSharedSocket();
        if (!socket || !socket.connected) {
          return reject(new Error(`伺服器尚未連線 (${serverUrl})`));
        }

        const currentId = userId || getOrCreateUUID();
        const payload = {
          userId: currentId,
          text: trimmed,
          originalText: trimmed,
          uuid: currentId,
        };

        // 發送 SUBMIT_DIARY 事件至伺服器
        socket.emit("SUBMIT_DIARY", payload, (response?: { success?: boolean; message?: string; id?: string }) => {
          resolve({
            success: true,
            id: response?.id,
            message: response?.message || "已加入排程佇列，等待分析處理",
          });
        });

        setTimeout(() => {
          resolve({ success: true, message: "已送出至伺服器排程佇列" });
        }, 1500);
      });
    },
    [serverUrl, userId]
  );

  // 監聽特定使用者的 DIARY_SUCCESS 通知
  const onDiarySuccess = useCallback((callback: (data: MessageLog & { message?: string }) => void) => {
    const socket = socketRef.current || getSharedSocket();
    socket.on("DIARY_SUCCESS", callback);
    return () => {
      socket.off("DIARY_SUCCESS", callback);
    };
  }, []);

  // 監聽特定使用者的 DIARY_ERROR 通知
  const onDiaryError = useCallback((callback: (err: { message: string; code?: string; id?: string; error?: string }) => void) => {
    const socket = socketRef.current || getSharedSocket();
    socket.on("DIARY_ERROR", callback);
    return () => {
      socket.off("DIARY_ERROR", callback);
    };
  }, []);

  return {
    isConnected,
    serverUrl,
    sendText,
    submitDiary,
    onDiarySuccess,
    onDiaryError,
    userId,
    userUUID: userId,
  };
}

export default SocketTextSender;
