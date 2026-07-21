"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import io from "socket.io-client";
import { SOCKET_EVENTS } from "../config/constants";
import { DisplayMessageData } from "./MessageDisplay";

type SocketType = ReturnType<typeof io>;

interface SocketManagerProps {
  onMessageReceived?: (data: DisplayMessageData) => void;
  onRequestNextRef?: (requestFn: () => void) => void;
}

export default function SocketManager({
  onMessageReceived,
  onRequestNextRef,
}: SocketManagerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string>("");
  const socketRef = useRef<SocketType | null>(null);

  const requestNextMessage = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      console.log("📤 [Mobile Display] Emitting request_next to server...");
      socketRef.current.emit(SOCKET_EVENTS.REQUEST_NEXT);
    }
  }, []);

  useEffect(() => {
    onRequestNextRef?.(requestNextMessage);
  }, [onRequestNextRef, requestNextMessage]);

  useEffect(() => {
    const socket = io({
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("⚡ [Mobile Display] Connected to Socket.IO server, ID:", socket.id);
      setIsConnected(true);
      setSocketId(socket.id || "");
    });

    socket.on("disconnect", (reason: string) => {
      console.log("❌ [Mobile Display] Disconnected from server:", reason);
      setIsConnected(false);
      setSocketId("");
    });

    socket.on(SOCKET_EVENTS.DISPLAY_MESSAGE, (data: DisplayMessageData) => {
      console.log("📩 [Mobile Display] Message received from server:", data);
      onMessageReceived?.(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [onMessageReceived]);

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-neutral-200 rounded-full text-[10px] font-mono tracking-widest text-neutral-600 select-none shadow-xs">
      <span
        className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
          isConnected ? "bg-neutral-900" : "bg-neutral-300 animate-pulse"
        }`}
      />
      <span>{isConnected ? "ONLINE" : "CONNECTING"}</span>
      {socketId && (
        <span className="text-neutral-400 hidden sm:inline">#{socketId.slice(0, 4)}</span>
      )}
    </div>
  );
}
