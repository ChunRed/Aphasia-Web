"use client";

import dynamic from "next/dynamic";
import OverlayCenterText from "@/components/ui/OverlayCenterText";

// Dynamically load the Three.js MainCanvas component with SSR disabled
const MainCanvas = dynamic(
  () => import("@/components/canvas/MainCanvas"),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-white">
      {/* 3D WebGL Canvas Layer (Thick Line + Connected Floating Text Nodes) */}
      <MainCanvas />

      {/* UI Overlay Layer */}
      <OverlayCenterText />
    </main>
  );
}
