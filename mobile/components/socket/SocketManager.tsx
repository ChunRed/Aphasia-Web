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

  // 0. 支援 URL 參數 ?server=... 或 ?socketUrl=...，方便手機端除錯或強制指定連線伺服器
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

  // 1. 環境變數優先
  if (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL) {
    url = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
  }

  // 2. 智慧判定在不同裝置與網路環境下的連線位址
  if (typeof window !== "undefined") {
    const { hostname, protocol, port } = window.location;

    // 若使用者直接開啟 8080 連接埠（如 Express 本體伺服器），以當前 origin 為準
    if (port === "8080") {
      return window.location.origin;
    }

    // 當手機透過 Wi-Fi 區網 (192.168.x.x / 10.x.x.x) 開啟網頁時，
    // 若 url 寫著 localhost / 127.0.0.1，手機會嘗試連線自己而失敗 (DISCONNECTED)。
    // 自動將 localhost 替換為當前網頁的主機 IP (hostname)！
    if (url && (url.includes("localhost") || url.includes("127.0.0.1"))) {
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        url = url.replace(/localhost|127\.0\.0\.1/g, hostname);
      }
    }

    // 若未設定 url 或 url 為空
    if (!url) {
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        url = "http://localhost:8080";
      } else if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith(".local")) {
        // 手機連入電腦區網 IP 開啟
        url = `http://${hostname}:8080`;
      } else if (protocol === "https:") {
        // HTTPS 線上環境：優先連線至具備有效 SSL 憑證的正式後端位址
        url = "https://2026daf.nosidehere.space";
      } else {
        // HTTP 線上環境
        url = "http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";
      }
    }

    // 自動安全協定升級與防禦：
    // 若前端在 HTTPS 環境，且 url 仍為 http:，且並非本地 IP
    if (protocol === "https:" && url.startsWith("http://")) {
      if (
        !url.includes("localhost") &&
        !url.includes("127.0.0.1") &&
        !/^(?:http:\/\/)?(?:\d{1,3}\.){3}\d{1,3}/.test(url)
      ) {
        // AWS Elastic Beanstalk 預設網址不支援 HTTPS，若在 HTTPS 前端自動改向具備 SSL 的 nosidehere.space
        if (url.includes("elasticbeanstalk.com")) {
          url = "https://2026daf.nosidehere.space";
        } else {
          url = url.replace(/^http:\/\//i, "https://");
        }
      }
    }
  } else {
    // SSR 備用
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
 * 取得或生成手機/客戶端持久性 Device UUID
 * 優先順序：
 * 1. URL 參數 ?deviceId=...（例如 ?deviceId=1 ~ 6 或 ?deviceId=phone-1，方便本地開啟多個分頁快速模擬 6 台不同手機）
 * 2. localStorage.getItem('device_uuid') 或舊版 key
 * 3. 若皆無，則生成一組新 UUID 並存入 localStorage
 */
export const getOrCreateDeviceUUID = (): string => {
  if (typeof window === "undefined") return "";

  // 1. 優先檢查 URL 參數
  try {
    const params = new URLSearchParams(window.location.search);
    const queryDeviceId = params.get("deviceId") || params.get("device_id") || params.get("id");
    if (queryDeviceId && queryDeviceId.trim().length > 0) {
      return queryDeviceId.trim();
    }
  } catch {
    // 忽略 SSR 或例外
  }

  // 2. 檢查 localStorage
  const STORAGE_KEYS = ["device_uuid", "aphasia_mobile_device_uuid", "aphasia_mobile_user_uuid"];
  try {
    for (const key of STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    }

    // 3. 若皆無，生成一組新 UUID 並存入 localStorage
    let id = "";
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    } else {
      id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem("device_uuid", id);
    return id;
  } catch {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "dev-" + Math.random().toString(36).substring(2, 11);
  }
};

export const getOrCreateUUID = getOrCreateDeviceUUID;

/**
 * 共享 Socket 單例（Singleton）
 * 防止多個元件重複建立連線
 */
let sharedSocket: SocketIOClient.Socket | null = null;

export const getSharedSocket = (): SocketIOClient.Socket => {
  const deviceUuid = getOrCreateDeviceUUID();
  if (!sharedSocket || sharedSocket.disconnected) {
    const targetUrl = getSocketServerUrl();
    const isSecure =
      typeof window !== "undefined"
        ? window.location.protocol === "https:"
        : targetUrl.startsWith("https:");

    sharedSocket = io(targetUrl, {
      query: {
        deviceUuid,
        deviceId: deviceUuid,
        uuid: deviceUuid,
        role: "mobile",
      },
      secure: isSecure,
      // 使用 polling 優先以確保舊款手機與行動網路能極速完成握手，再自動升級為 websocket
      transports: ["polling", "websocket"],
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

export interface DispatchPayload {
  id: string;
  userId: string;
  originalText: string;
  keywords: string[];
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
  /** 裝置專屬識別碼 (支援 URL ?deviceId=1~6 或 localStorage) */
  deviceUuid: string;
  /** 最新接收到的 text 資料 */
  latestText: string;
  /** 接收到的歷史文字資料清單 */
  textHistory: SocketMessage[];
  /** 最新由 Server 派發之分析資料 */
  currentPayload: DispatchPayload | null;
  /** 當前裝置狀態：閒置 (idle) 或展示中 (busy) */
  deviceStatus: "idle" | "busy";
  /** 向 Server 發送 DEVICE_IDLE 回報視覺演出完成並解鎖 */
  reportIdle: () => void;
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
  deviceUuid: "",
  latestText: "",
  textHistory: [],
  currentPayload: null,
  deviceStatus: "idle",
  reportIdle: () => {},
  sendText: async () => ({ success: false, message: "Socket not initialized" }),
  emit: () => {},
});

export interface SocketManagerProps {
  children?: ReactNode;
  /** 當接收到 new_text 時的自訂回呼函式 */
  onNewText?: (text: string, uuid: string) => void;
  /** 當接收到 DISPATCH_PAYLOAD 時的自訂回呼函式 */
  onDispatchPayload?: (payload: DispatchPayload) => void;
  /** 是否在畫面右上角顯示連線狀態小指示器（方便除錯，預設 false） */
  showIndicator?: boolean;
}

/**
 * 元件：SocketManager / SocketProvider
 * 負責 Socket.IO 連線管理、多裝置識別 (Device UUID)、拉取式派工握手 (DEVICE_READY/DISPATCH_PAYLOAD/DEVICE_IDLE)
 */
export function SocketManager({
  children,
  onNewText,
  onDispatchPayload,
  showIndicator = false,
}: SocketManagerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [uuid, setUuid] = useState("");
  const [deviceUuid, setDeviceUuid] = useState("");
  const [latestText, setLatestText] = useState("");
  const [textHistory, setTextHistory] = useState<SocketMessage[]>([]);
  const [currentPayload, setCurrentPayload] = useState<DispatchPayload | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"idle" | "busy">("idle");
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    const targetUrl = getSocketServerUrl();
    const currentDeviceUuid = getOrCreateDeviceUUID();
    setServerUrl(targetUrl);
    setUuid(currentDeviceUuid);
    setDeviceUuid(currentDeviceUuid);

    const socket = getSharedSocket();
    socketRef.current = socket;
    setIsConnected(socket.connected);

    const handleConnect = () => {
      console.log(`[SocketManager] 連線成功: ${targetUrl} (Device UUID: ${currentDeviceUuid})`);
      setIsConnected(true);
      // 發送 DEVICE_READY 事件宣告就緒（攜帶目前狀態為 idle 與 deviceUuid）
      socket.emit("DEVICE_READY", {
        deviceUuid: currentDeviceUuid,
        deviceId: currentDeviceUuid,
        status: "idle",
      });
      console.log(`[SocketManager] 已向 Server 發送 DEVICE_READY (Device: ${currentDeviceUuid}, status: idle)`);
    };

    const handleDisconnect = (reason: string) => {
      console.log(`[SocketManager] 連線中斷: ${reason}`);
      setIsConnected(false);
    };

    const handleConnectError = (err: Error) => {
      console.warn(`[SocketManager] 連線失敗 (${targetUrl}):`, err?.message || err);
      setIsConnected(false);
    };

    // 監聽 Server 派發已完成分析訊息：DISPATCH_PAYLOAD
    const handleDispatchPayload = (payload: DispatchPayload) => {
      if (payload && payload.id) {
        console.log(`[SocketManager] 收到 DISPATCH_PAYLOAD (ID: ${payload.id}, User: ${payload.userId}, 關鍵字: [${payload.keywords?.join(", ")}])`);
        setCurrentPayload(payload);
        setDeviceStatus("busy");
        if (payload.originalText) {
          setLatestText(payload.originalText);
          setTextHistory((prev) => [
            { uuid: payload.userId || "", text: payload.originalText, timestamp: Date.now() },
            ...prev.slice(0, 49),
          ]);
        }
        onDispatchPayload?.(payload);
      }
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

    // 若 socket 已經處於連線狀態（例如從單例中取出），立即發送一次 DEVICE_READY
    if (socket.connected) {
      socket.emit("DEVICE_READY", {
        deviceUuid: currentDeviceUuid,
        deviceId: currentDeviceUuid,
        status: "idle",
      });
      console.log(`[SocketManager] 現有連線立即發送 DEVICE_READY (Device: ${currentDeviceUuid}, 狀態: idle)`);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("DISPATCH_PAYLOAD", handleDispatchPayload);
    socket.on("new_text", handleNewText);
    socket.on("init_data", handleInitData);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("DISPATCH_PAYLOAD", handleDispatchPayload);
      socket.off("new_text", handleNewText);
      socket.off("init_data", handleInitData);
    };
  }, [onNewText, onDispatchPayload]);

  // 完成回報與解鎖：主動發送 DEVICE_IDLE 通知 Server
  const reportIdle = useCallback(() => {
    const socket = socketRef.current || getSharedSocket();
    const currentId = deviceUuid || uuid || getOrCreateDeviceUUID();
    console.log(`[SocketManager] 視覺演出完成，發送 DEVICE_IDLE (Device: ${currentId})`);
    setDeviceStatus("idle");
    if (socket && socket.connected) {
      socket.emit("DEVICE_IDLE", {
        deviceUuid: currentId,
        deviceId: currentId,
        status: "idle",
      });
    }
  }, [deviceUuid, uuid]);

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

        const currentUUID = deviceUuid || uuid || getOrCreateDeviceUUID();
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
    [serverUrl, uuid, deviceUuid]
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
    deviceUuid,
    latestText,
    textHistory,
    currentPayload,
    deviceStatus,
    reportIdle,
    sendText,
    emit,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
      {showIndicator && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono bg-black/75 backdrop-blur-md text-white border border-white/20 select-none shadow pointer-events-none">
          <span
            className={`w-2 h-2 rounded-full ${
              !isConnected
                ? "bg-red-400"
                : deviceStatus === "busy"
                ? "bg-amber-400 animate-pulse"
                : "bg-emerald-400 animate-pulse"
            }`}
          />
          <span>
            {isConnected
              ? `DEV [${deviceUuid || uuid}] • ${deviceStatus.toUpperCase()}`
              : "DISCONNECTED"}
          </span>
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
