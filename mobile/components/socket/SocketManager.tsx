"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import io from "socket.io-client";

/**
 * 1. 自動判定 Socket.IO Server 連線位址
 * 優先順序：
 *  - 1. 環境變數 NEXT_PUBLIC_SOCKET_SERVER_URL (.env.local)
 *  - 2. 本地開發環境 (localhost / 127.0.0.1) -> http://localhost:8080
 *  - 3. 線上正式環境 -> http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com
 */
export const getSocketServerUrl = (): string => {
  let url = "";

  if (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL) {
    url = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
  } else if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      url = "http://localhost:8080";
    } else {
      url = "https://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";
    }
  } else {
    url =
      process.env.NODE_ENV === "development"
        ? "http://localhost:8080"
        : "https://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";
  }

  // 自動安全升級：當前端在 HTTPS 環境（如 Vercel）執行時，
  // 瀏覽器嚴格禁止連線至非安全的 http / ws 端點（Mixed Content 封鎖）。
  // 因此若非本地測試 (localhost)，自動將 http:// 升級為 https:// (對應 WebSocket 的 wss://)。
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    if (
      url.startsWith("http://") &&
      !url.includes("localhost") &&
      !url.includes("127.0.0.1")
    ) {
      url = url.replace(/^http:\/\//i, "https://");
    }
  }

  return url;
};

/**
 * 取得或生成手機/客戶端持久性 UUID
 * 優先讀取 localStorage，若不存在則生成並寫入
 */
export const getOrCreateUUID = (): string => {
  if (typeof window === "undefined") return "";

  const STORAGE_KEY = "aphasia_mobile_user_uuid";
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
 * 共享 Socket 單例（Singleton）
 * 防止多個元件重複建立連線
 */
let sharedSocket: SocketIOClient.Socket | null = null;

export const getSharedSocket = (): SocketIOClient.Socket => {
  if (!sharedSocket || sharedSocket.disconnected) {
    const targetUrl = getSocketServerUrl();
    const userUUID = getOrCreateUUID();
    const isSecure =
      typeof window !== "undefined"
        ? window.location.protocol === "https:"
        : targetUrl.startsWith("https:");

    sharedSocket = io(targetUrl, {
      query: {
        uuid: userUUID,
        role: "client",
      },
      secure: isSecure,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return sharedSocket;
};

export interface SocketMessage {
  uuid: string;
  text: string;
  timestamp: number;
}

export interface SocketContextValue {
  /** Socket 實例 */
  socket: SocketIOClient.Socket | null;
  /** 連線狀態 */
  isConnected: boolean;
  /** 當前連線的伺服器位址 */
  serverUrl: string;
  /** 本地客戶端 UUID */
  uuid: string;
  /** 最新接收到的 text 資料 */
  latestText: string;
  /** 接收到的歷史文字資料清單 */
  textHistory: SocketMessage[];
  /** 傳送文字方法（發送 submit_text 事件） */
  sendText: (text: string) => Promise<{ success: boolean; message: string }>;
  /** 通用資料傳送方法 */
  emit: (event: string, data: any, callback?: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  serverUrl: "",
  uuid: "",
  latestText: "",
  textHistory: [],
  sendText: async () => ({ success: false, message: "Socket not initialized" }),
  emit: () => {},
});

export interface SocketManagerProps {
  children?: ReactNode;
  /** 當接收到 new_text 時的自訂回呼函式 */
  onNewText?: (text: string, uuid: string) => void;
  /** 是否在畫面右上角顯示連線狀態小指示器（方便除錯，預設 false） */
  showIndicator?: boolean;
}

/**
 * 元件：SocketManager / SocketProvider
 * 負責 Socket.IO 連線管理、自動判定伺服器位址、資料接收（new_text 等）與資料傳送
 */
export function SocketManager({
  children,
  onNewText,
  showIndicator = false,
}: SocketManagerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [uuid, setUuid] = useState("");
  const [latestText, setLatestText] = useState("");
  const [textHistory, setTextHistory] = useState<SocketMessage[]>([]);
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    const userUUID = getOrCreateUUID();
    setServerUrl(targetUrl);
    setUuid(userUUID);

    const socket = getSharedSocket();
    socketRef.current = socket;
    setIsConnected(socket.connected);

    const handleConnect = () => {
      console.log(`[SocketManager] 連線成功: ${targetUrl} (UUID: ${userUUID})`);
      setIsConnected(true);
    };

    const handleDisconnect = (reason: string) => {
      console.log(`[SocketManager] 連線中斷: ${reason}`);
      setIsConnected(false);
    };

    const handleConnectError = (err: Error) => {
      console.warn(`[SocketManager] 連線失敗 (${targetUrl}):`, err?.message || err);
      setIsConnected(false);
    };

    // 監聽 new_text event 儲存其中的 text 資料
    const handleNewText = (data: { uuid?: string; text?: string } | string) => {
      const receivedText =
        typeof data === "string" ? data : (data && typeof data === "object" ? data.text || "" : "");
      const senderUuid =
        typeof data === "object" && data && data.uuid ? data.uuid : "";

      if (receivedText) {
        console.log("[SocketManager] 收到 new_text:", receivedText);
        setLatestText(receivedText);
        setTextHistory((prev) => [
          { uuid: senderUuid, text: receivedText, timestamp: Date.now() },
          ...prev.slice(0, 49),
        ]);
        onNewText?.(receivedText, senderUuid);
      }
    };

    // 亦支援伺服器初始發送的 logs
    const handleInitData = (initData: { logs?: Array<{ uuid?: string; text?: string }> }) => {
      if (initData && Array.isArray(initData.logs) && initData.logs.length > 0) {
        const formatted = initData.logs
          .filter((log) => Boolean(log?.text))
          .map((log) => ({
            uuid: log.uuid || "",
            text: log.text || "",
            timestamp: Date.now(),
          }));
        setTextHistory((prev) => {
          const combined = [...prev, ...formatted];
          return combined.slice(0, 50);
        });
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("new_text", handleNewText);
    socket.on("init_data", handleInitData);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("new_text", handleNewText);
      socket.off("init_data", handleInitData);
    };
  }, [onNewText]);

  // 資料傳送：發送 submit_text
  const sendText = useCallback(
    (textToSend: string): Promise<{ success: boolean; message: string }> => {
      return new Promise((resolve, reject) => {
        const trimmed = textToSend ? textToSend.trim() : "";
        if (!trimmed) {
          return reject(new Error("傳送內容不能為空"));
        }

        const socket = socketRef.current || getSharedSocket();
        if (!socket || !socket.connected) {
          return reject(new Error(`Socket 尚未連線 (${serverUrl})`));
        }

        const currentUUID = uuid || getOrCreateUUID();
        const payload = {
          uuid: currentUUID,
          text: trimmed,
        };

        socket.emit("submit_text", payload, (response?: { success?: boolean; message?: string }) => {
          console.log("[SocketManager] 伺服器回傳確認:", response);
          resolve({
            success: true,
            message: response?.message || "傳送成功",
          });
        });

        // 逾時安全保障
        setTimeout(() => {
          resolve({ success: true, message: "文字已送出" });
        }, 1200);
      });
    },
    [serverUrl, uuid]
  );

  // 通用事件傳送
  const emit = useCallback(
    (event: string, data: any, callback?: (...args: any[]) => void) => {
      const socket = socketRef.current || getSharedSocket();
      if (socket) {
        socket.emit(event, data, callback);
      }
    },
    []
  );

  const contextValue: SocketContextValue = {
    socket: socketRef.current,
    isConnected,
    serverUrl,
    uuid,
    latestText,
    textHistory,
    sendText,
    emit,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
      {showIndicator && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono bg-black/70 backdrop-blur-md text-white border border-white/20 select-none shadow">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
            }`}
          />
          <span>{isConnected ? "CONNECTED" : "DISCONNECTED"}</span>
        </div>
      )}
    </SocketContext.Provider>
  );
}

/**
 * 自訂 Hook：useSocket
 * 方便任何子元件存取連線狀態、收到的 latestText 與發送方法
 */
export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

export default SocketManager;
