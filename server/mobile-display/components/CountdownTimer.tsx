"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DISPLAY_DURATION_SEC } from "../config/constants";

interface CountdownTimerProps {
  durationSec?: number;
  messageKey?: string | number;
  onComplete?: () => void;
}

export default function CountdownTimer({
  durationSec = DEFAULT_DISPLAY_DURATION_SEC,
  messageKey,
  onComplete,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(durationSec);

  useEffect(() => {
    setTimeLeft(durationSec);
  }, [durationSec, messageKey]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onComplete]);

  const progressPercent = Math.min(
    100,
    Math.max(0, (timeLeft / durationSec) * 100)
  );

  return (
    <div className="w-full max-w-xl mx-auto my-6 p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs">
      <div className="flex items-center justify-between mb-3 px-0.5 text-xs font-mono text-neutral-500">
        <span className="tracking-widest text-[11px]">切換倒數</span>
        <span className="font-mono text-neutral-900 text-xs font-medium">{timeLeft}s</span>
      </div>

      {/* Progress Bar Container - Ultra Minimalist 2px line */}
      <div className="w-full h-1 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-neutral-900 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-3 text-[11px] text-center text-neutral-400 font-mono tracking-wider">
        {timeLeft > 0 ? (
          <span>{timeLeft} 秒後請求下則訊息</span>
        ) : (
          <span className="text-neutral-900 font-medium animate-pulse">
            即將更新訊息...
          </span>
        )}
      </div>
    </div>
  );
}
