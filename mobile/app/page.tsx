"use client";

import React, { useState, useEffect, Component, ReactNode, ErrorInfo } from "react";
import dynamic from "next/dynamic";
import { SocketManager, useSocket, getValidatedDeviceId } from "@/components/socket/SocketManager";
import {
  PerformanceTimelineProvider,
  usePerformanceTimeline,
  TimelinePhase,
} from "@/components/timeline/PerformanceTimeline";
import OverlayCenterText from "@/components/ui/OverlayCenterText";
import { useWakeLock } from "@/hooks/useWakeLock";

// Dynamically load the Three.js MainCanvas component with SSR disabled
const MainCanvas = dynamic(
  () => import("@/components/canvas/MainCanvas"),
  { ssr: false }
);

/**
 * 暫時性 Debug 驗證指示器
 * 顯示格式：[Timer: 12.4s | PHASE_2_RUPTURE]
 */
function TimelineIndicator() {
  const { phase, elapsedTime, cycleIndex } = usePerformanceTimeline();

  const phaseColors: Record<TimelinePhase, string> = {
    [TimelinePhase.PHASE_1_ACCUMULATE]: "text-emerald-400 border-emerald-500/30",
    [TimelinePhase.PHASE_2_RUPTURE]: "text-amber-400 border-amber-500/50 animate-pulse",
    [TimelinePhase.PHASE_3_ERASE]: "text-rose-400 border-rose-500/30",
    [TimelinePhase.PHASE_4_RESIDUAL]: "text-cyan-400 border-cyan-500/30",
  };

  return (
    <div
      className="fixed left-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono bg-black/85 backdrop-blur-md text-white border border-white/20 select-none shadow pointer-events-none transition-colors duration-300"
      style={{ top: "max(12px, calc(env(safe-area-inset-top, 0px) + 8px))" }}
    >
      <span className="text-white/60">[Timer:</span>
      <span className="font-semibold text-white tracking-wide">
        {elapsedTime.toFixed(1)}s
      </span>
      <span className="text-white/40">|</span>
      <span className={`font-semibold tracking-wider ${phaseColors[phase]}`}>
        {phase}
      </span>
      <span className="text-white/60">]</span>
      {cycleIndex > 0 && (
        <span className="opacity-40 text-[9px] ml-1">#{cycleIndex}</span>
      )}
    </div>
  );
}

interface CanvasErrorBoundaryProps {
  children: ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
}

class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[CanvasErrorBoundary] WebGL canvas error caught, degrading to pure canvas fallback:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div className="absolute inset-0 bg-white pointer-events-none" />;
    }
    return this.props.children;
  }
}

function MobileDisplay() {
  const { currentPayload } = useSocket();
  // 保持螢幕常亮（Screen Wake Lock API），防止展覽期間螢幕自動熄滅
  useWakeLock();

  return (
    <PerformanceTimelineProvider autoReportIdle={true} initialPayload={currentPayload}>
      <main className="relative w-screen h-screen overflow-hidden bg-white select-none">
        {/* Timeline HUD Debug Indicator: [Timer: 12.4s | PHASE_2_RUPTURE] */}
        <TimelineIndicator />

        {/* 3D WebGL Canvas Layer (以 CanvasErrorBoundary 包覆防禦舊款手機 WebGL 崩潰) */}
        <CanvasErrorBoundary>
          <MainCanvas keywords={currentPayload?.keywords} />
        </CanvasErrorBoundary>

        {/* 2D UI Overlay Layer (0-12s 沉澱打字與凝視 -> 12-15s 對照 -> 15-21s 倒退抹消 -> 21-25s 殘留懸空) */}
        <OverlayCenterText payload={currentPayload} />
      </main>
    </PerformanceTimelineProvider>
  );
}

export default function Home() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const id = getValidatedDeviceId();
    setDeviceId(id);
    setIsChecking(false);
  }, []);

  // 1. 前端嚴格阻斷（Block & No-Socket）：
  // 檢查中保持純黑背景，不發起連線、不渲染任何動畫或計時器
  if (isChecking) {
    return <main className="w-screen h-screen bg-black" />;
  }

  // 若為其他數值、格式錯誤或未提供參數 (非 1~6)：
  // 立即中斷載入流程，不得發起 Socket.io 連線，不渲染任何 3D 場景、文字動畫或計時器。
  // 畫面直接停留在純黑背景並顯示 403 Forbidden / Unauthorized Device 提示。
  if (!deviceId) {
    return (
      <main className="flex flex-col items-center justify-center w-screen h-screen bg-black text-white select-none px-6">
        <div className="flex flex-col items-center max-w-xs text-center border border-white/10 bg-white/[0.03] backdrop-blur-md px-6 py-8 rounded-lg shadow-2xl">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse mb-3" />
          <h1 className="font-mono text-sm tracking-[0.3em] uppercase font-bold text-rose-400 mb-1">
            403 Forbidden
          </h1>
          <p className="font-mono text-xs tracking-wider text-white/70 uppercase mb-4">
            Unauthorized Device
          </p>
          <div className="border-t border-white/10 pt-3 w-full">
            <span className="font-mono text-[10px] tracking-widest text-white/30 uppercase">
              Access Limited: ?deviceId=1 ~ 6
            </span>
          </div>
        </div>
      </main>
    );
  }

  // 只有合法白名單裝置 (1~6) 才會掛載 SocketManager 並發起連線
  return (
    <SocketManager deviceId={deviceId} showIndicator={true}>
      <MobileDisplay />
    </SocketManager>
  );
}
