"use client";

import { useEffect, useState } from "react";
import io from "socket.io-client";

type SocketType = ReturnType<typeof io>;

interface SocketManagerProps {
  onMessageReceived?: (data: any) => void;
}

export default function SocketManager({ onMessageReceived }: SocketManagerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string>("");
  const [, setSocketInstance] = useState<SocketType | null>(null);

  useEffect(() => {
    // Initialize socket connection (connects to current origin automatically)
    const socket = io({
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

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

    socket.on("message", (data: any) => {
      console.log("📩 [Mobile Display] Message received:", data);
      onMessageReceived?.(data);
    });

    setSocketInstance(socket);

    return () => {
      socket.disconnect();
    };
  }, [onMessageReceived]);

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-stone-900/80 backdrop-blur-sm border border-stone-800 rounded-full text-[10px] font-mono tracking-widest text-stone-300 shadow-md select-none">
      <span
        className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-500 animate-ping"
        }`}
      />
      <span>{isConnected ? "SOCKET CONNECTED" : "CONNECTING..."}</span>
      {socketId && (
        <span className="text-stone-500 hidden sm:inline">({socketId.slice(0, 6)})</span>
      )}
    </div>
  );
}
