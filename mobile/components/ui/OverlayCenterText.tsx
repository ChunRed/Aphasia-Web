import React from "react";

export default function OverlayCenterText() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none">
      <div
        className="px-4 py-1.5 bg-black/80 backdrop-blur-md border border-white/15 rounded-sm shadow-md"
        style={{
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <span className="font-mono text-xs sm:text-sm tracking-[0.35em] text-white uppercase font-medium">
          [ web view ]
        </span>
      </div>
    </div>
  );
}

