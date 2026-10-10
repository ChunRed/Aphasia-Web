"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSocket } from "../socket/SocketManager";

export interface OverlayCenterTextProps {
  /** 手動傳入文字（可選，若無傳入則自動使用 Socket 接收到的最新 text 資料） */
  text?: string;
  /** 打字機打印速度（毫秒/字元），預設 40ms */
  typingSpeed?: number;
  /** 預設顯示文字（當尚未接收到任何 text 資料時） */
  defaultText?: string;
}

export default function OverlayCenterText({
  text: propText,
  typingSpeed = 40,
  defaultText = "[ web view ]",
}: OverlayCenterTextProps) {
  const { latestText } = useSocket();

  // 優先使用 propText，若無則使用 Socket 監聽到的 latestText
  const activeText = propText !== undefined ? propText : latestText;

  // 顯示的文字（含打字機逐字打印效果）
  const [displayText, setDisplayText] = useState<string>(activeText || defaultText);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevTextRef = useRef<string>("");

  useEffect(() => {
    // 若沒有任何文字傳入，顯示預設的 [ web view ]
    if (!activeText) {
      setDisplayText(defaultText);
      prevTextRef.current = "";
      return;
    }

    // 若收到的文字相同，不需重複觸發打字
    if (activeText === prevTextRef.current) {
      return;
    }
    prevTextRef.current = activeText;

    // 清除既有定時器
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // 啟動打字機逐字打印效果
    let currentIndex = 0;
    setDisplayText("");
    setIsTyping(true);

    timerRef.current = setInterval(() => {
      currentIndex++;
      setDisplayText(activeText.slice(0, currentIndex));

      if (currentIndex >= activeText.length) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsTyping(false);
      }
    }, typingSpeed);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeText, defaultText, typingSpeed]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none px-4">
      <div
        className="max-w-[88vw] px-4 py-2 bg-black/80 backdrop-blur-md border border-white/15 rounded-sm shadow-md transition-all duration-300"
        style={{
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <span className="font-mono text-xs sm:text-sm tracking-[0.35em] text-white uppercase font-medium inline-block text-center break-words">
          {displayText}
          {isTyping && (
            <span className="inline-block animate-pulse ml-0.5 opacity-80">_</span>
          )}
        </span>
      </div>
    </div>
  );
}
