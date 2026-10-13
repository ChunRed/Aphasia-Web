"use client";

import dynamic from "next/dynamic";
import { SocketManager, useSocket } from "@/components/socket/SocketManager";
import OverlayCenterText from "@/components/ui/OverlayCenterText";

// Dynamically load the Three.js MainCanvas component with SSR disabled
const MainCanvas = dynamic(
  () => import("@/components/canvas/MainCanvas"),
  { ssr: false }
);

function MobileDisplay() {
  const { currentPayload } = useSocket();

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-white">
      {/* 3D WebGL Canvas Layer (Thick Line + Connected Floating Text Nodes) */}
      <MainCanvas keywords={currentPayload?.keywords} />

      {/* UI Overlay Layer (Typing -> Hold -> Smart Backspace -> Report Idle -> Idle Loop) */}
      <OverlayCenterText payload={currentPayload} />
    </main>
  );
}

export default function Home() {
  return (
    <SocketManager showIndicator={true}>
      <MobileDisplay />
    </SocketManager>
  );
}
