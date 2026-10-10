import React from "react";

export default function OverlayCenterText() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none">
      <span className="font-mono text-xs sm:text-sm tracking-[0.35em] text-black uppercase font-medium">
        [ web view ]
      </span>
    </div>
  );
}
