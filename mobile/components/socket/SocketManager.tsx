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
import {
  getSeedPresetForDevice,
  isValidDeviceId,
  isLocalEnvironment,
  AllowedDeviceId,
} from "@/config/seedPresets";

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
 * 嚴格驗證 URL 參數中的裝置編號 (僅允許 "1"、"2"、"3"、"4"、"5"、"6")
 * - 正式線上環境：若未提供、格式錯誤或非 1~6，一律回傳 null，嚴格禁止進入與連線，不進行任何回退
 * - 本地開發 / 預覽環境 (localhost, 127.0.0.1, 區網 IP)：若未提供參數，自動預設為裝置 "1"，使本地直接開啟即可預覽
 */
export const getValidatedDeviceId = (): AllowedDeviceId | null => {
  if (typeof window === "undefined") {
    return isLocalEnvironment() ? "1" : null;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("deviceId") || params.get("device_id") || params.get("id");
    
    // 若 URL 明確帶有參數
    if (raw !== null && raw !== undefined && raw.trim() !== "") {
      const trimmed = raw.trim();
      if (isValidDeviceId(trimmed)) {
        return trimmed as AllowedDeviceId;
      }
      // 明確給了非 1~6 之非法值，一律阻擋（方便除錯與安全性驗證）
      return null;
    }

    // 若未在 URL 提供 deviceId 參數：
    // 本地開發 / 預覽環境 (localhost, 127.0.0.1, 區網 IP 或 development) 預設使用 "1"，支援開箱直接預覽
    if (isLocalEnvironment()) {
      return "1";
    }
  } catch {}
  return null;
};

export const getOrCreateDeviceUUID = (): string => {
  return getValidatedDeviceId() || "";
};

export const getOrCreateUUID = getOrCreateDeviceUUID;

/**
 * 共享 Socket 單例（Singleton）
 * 嚴格阻斷：若非合法 1~6 裝置編號，絕不發起連線，直接回傳 null
 */
let sharedSocket: SocketIOClient.Socket | null = null;

export const getSharedSocket = (explicitDeviceId?: string | null): SocketIOClient.Socket | null => {
  const deviceUuid = explicitDeviceId || getValidatedDeviceId();
  if (!deviceUuid || !isValidDeviceId(deviceUuid)) {
    console.warn(`[SocketManager] 非白名單裝置編號 (${deviceUuid})，禁止建立 Socket 連線！`);
    return null;
  }

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
  /** 外部強制傳入之合法白名單裝置編號 (1~6) */
  deviceId?: string | null;
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
  deviceId: propDeviceId,
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

  const currentDeviceUuid =
    propDeviceId || (typeof window !== "undefined" ? getValidatedDeviceId() : null);

  const [currentPayload, setCurrentPayload] = useState<DispatchPayload | null>(() => {
    return currentDeviceUuid ? getSeedPresetForDevice(currentDeviceUuid) : null;
  });
  const [deviceStatus, setDeviceStatus] = useState<"idle" | "busy">("busy");
  const deviceStatusRef = useRef<"idle" | "busy">("busy");
  deviceStatusRef.current = deviceStatus;
  const socketRef = useRef<SocketIOClient.Socket | null>(null);

  useEffect(() => {
    // 嚴格阻斷：若非合法 1~6 裝置編號，不得發起 Socket.io 連線
    if (!currentDeviceUuid || !isValidDeviceId(currentDeviceUuid)) {
      console.warn(`[SocketManager] 未提供或非白名單裝置編號 (${currentDeviceUuid})，不發起 Socket 連線。`);
      return;
    }

    const targetUrl = getSocketServerUrl();
    setServerUrl(targetUrl);
    setUuid(currentDeviceUuid);
    setDeviceUuid(currentDeviceUuid);

    const preset = getSeedPresetForDevice(currentDeviceUuid);
    if (preset) {
      setCurrentPayload(preset);
    }

    const socket = getSharedSocket(currentDeviceUuid);
    if (!socket) return;
    socketRef.current = socket;
    setIsConnected(socket.connected);

    const handleConnect = () => {
      console.log(`[SocketManager] 白名單裝置連線成功: ${targetUrl} (Device ID: ${currentDeviceUuid})`);
      setIsConnected(true);
      // 發送 DEVICE_READY 事件宣告就緒（攜帶當前狀態與 deviceUuid）
      socket.emit("DEVICE_READY", {
        deviceUuid: currentDeviceUuid,
        deviceId: currentDeviceUuid,
        status: deviceStatusRef.current,
      });
      console.log(`[SocketManager] 已向 Server 發送 DEVICE_READY (Device: ${currentDeviceUuid}, status: ${deviceStatusRef.current})`);
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
        deviceStatusRef.current = "busy";
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
        status: deviceStatusRef.current,
      });
      console.log(`[SocketManager] 現有連線立即發送 DEVICE_READY (Device: ${currentDeviceUuid}, 狀態: ${deviceStatusRef.current})`);
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
    const currentId = deviceUuid || uuid || getValidatedDeviceId();
    if (!currentId || !isValidDeviceId(currentId)) return;
    const socket = socketRef.current || getSharedSocket(currentId);
    console.log(`[SocketManager] 視覺演出完成，發送 DEVICE_IDLE (Device: ${currentId})`);
    setDeviceStatus("idle");
    deviceStatusRef.current = "idle";
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
        <div
          className="fixed right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono bg-black/75 backdrop-blur-md text-white border border-white/20 select-none shadow pointer-events-none"
          style={{ top: "max(12px, calc(env(safe-area-inset-top, 0px) + 8px))" }}
        >
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
