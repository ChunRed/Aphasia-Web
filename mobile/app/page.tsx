"use client";

import dynamic from "next/dynamic";
import { SocketManager, useSocket } from "@/components/socket/SocketManager";
import {
  PerformanceTimelineProvider,
  usePerformanceTimeline,
  TimelinePhase,
} from "@/components/timeline/PerformanceTimeline";
import OverlayCenterText from "@/components/ui/OverlayCenterText";

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

import React, { Component, ReactNode, ErrorInfo } from "react";

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

  return (
    <PerformanceTimelineProvider autoReportIdle={true}>
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
  return (
    <SocketManager showIndicator={true}>
      <MobileDisplay />
    </SocketManager>
  );
}
