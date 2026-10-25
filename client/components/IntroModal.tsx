"use client";

import { useState, useRef, useEffect } from "react";
import ScrambleText from "@/components/ScrambleText";
import RedactedText from "@/components/RedactedText";

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartExperience?: () => void;
}

export default function IntroModal({ isOpen, onClose, onStartExperience }: IntroModalProps) {
  const [isRedacting, setIsRedacting] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isRedacting || isClosing) return;

    // 1. Start redaction sequence
    setIsRedacting(true);
    setCountdown(5);

    // 2. Start countdown ticker (5 seconds)
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1200);

    // 3. Allow slower glide animation to complete + full 5-second hold on keywords
    timerRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsClosing(true);

      setTimeout(() => {
        onStartExperience?.();
        onClose();
        setIsClosing(false);
        setIsRedacting(false);
      }, 500);
    }, 3000);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none transition-opacity duration-500 ease-out ${isClosing ? "opacity-0 pointer-events-none" : "opacity-100 animate-fade-in"
        }`}
    >
      <div className="bg-[#fafaf9] border border-stone-200 p-8 max-w-md w-full text-center relative shadow-lg overflow-hidden">
        {/* Title */}
        <h2 className="text-stone-800 text-sm sm:text-base font-normal tracking-[0.25em] mb-6">
          <RedactedText trigger={isRedacting} delay={1.1} duration={0.85}>
            <ScrambleText text="互動說明" trigger={isOpen} delay={150} duration={1000} />
          </RedactedText>
        </h2>

        {/* Concept and Instructions - Zero layout shift guaranteed, no scrollbars */}
        <div className="text-stone-600 text-xs sm:text-sm font-light tracking-widest leading-relaxed text-left space-y-4 mb-8 overflow-hidden select-none">
          <p className="m-0 p-0">
            <RedactedText trigger={isRedacting} delay={0.05} duration={0.85}>全世界</RedactedText><span className="text-stone-900 font-normal m-0 p-0">每天</span><RedactedText trigger={isRedacting} delay={0.12} duration={0.85}>產生約 </RedactedText><span className="text-stone-900 font-normal m-0 p-0">3.5 億</span><RedactedText trigger={isRedacting} delay={0.18} duration={0.85}> Terabytes 的資訊，</RedactedText><RedactedText trigger={isRedacting} delay={0.25} duration={0.85}>同等物質質量約為 </RedactedText><RedactedText trigger={isRedacting} delay={0.32} duration={0.85}><span className="font-mono">8.93 × 10<sup>-14</sup></span> 公克，</RedactedText><RedactedText trigger={isRedacting} delay={0.4} duration={0.85}>平均生成 </RedactedText><span className="text-stone-900 font-normal m-0 p-0 font-mono">1 bit</span><RedactedText trigger={isRedacting} delay={0.48} duration={0.85}> 資訊僅需約 0.02 秒的時間。</RedactedText><RedactedText trigger={isRedacting} delay={0.56} duration={0.85}>在龐大的數據中，純粹用於表達</RedactedText><span className="text-stone-900 font-normal m-0 p-0">主觀情感</span><RedactedText trigger={isRedacting} delay={0.64} duration={0.85}>的字詞經判定不具備流通效益，</RedactedText><RedactedText trigger={isRedacting} delay={0.72} duration={0.85}>屬於系統內的無效冗餘。</RedactedText>
          </p>

          <p className="m-0 p-0">
            <RedactedText trigger={isRedacting} delay={0.8} duration={0.85}>本系統將針對所接收的字元執行分析，</RedactedText><RedactedText trigger={isRedacting} delay={0.88} duration={0.85}>提取最具使用價值的關鍵詞，並將其換算為等重物理質量，</RedactedText><span className="text-stone-900 font-normal m-0 p-0">抹除</span><RedactedText trigger={isRedacting} delay={0.96} duration={0.85}>其餘</RedactedText><span className="text-stone-900 font-normal m-0 p-0">無關緊要</span><RedactedText trigger={isRedacting} delay={1.04} duration={0.85}>的文字。</RedactedText>
          </p>
        </div>

        {/* Button */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isRedacting || isClosing}
          className={`w-full py-3 text-xs tracking-[0.3em] font-light transition-all duration-300 relative overflow-hidden focus:outline-none ${isRedacting
            ? "bg-stone-900 text-stone-300 cursor-default"
            : "bg-stone-800 hover:bg-stone-700 text-stone-100 cursor-pointer"
            }`}
        >
          {/* Progress bar line while redacting */}
          {/* {isRedacting && (
            <span
              className="absolute inset-0 bg-stone-700/60 pointer-events-none"
              style={{
                animation: "progressExpand 6.2s linear forwards",
                transformOrigin: "left center",
              }}
            />
          )} */}

          <span className="relative z-10 font-mono">
            {isRedacting ? (
              <span className="flex items-center justify-center gap-2">
                <span>冗餘字詞抹除中</span>
              </span>
            ) : (
              <ScrambleText text="進入系統 / ENTER" trigger={isOpen} delay={300} duration={800} />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
