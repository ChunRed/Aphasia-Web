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
    }, 8000);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none transition-opacity duration-500 ease-out ${isClosing ? "opacity-0 pointer-events-none" : "opacity-100 animate-fade-in"
        }`}
    >
      <div className="bg-[#fafaf9] border border-stone-200 p-8 max-w-md w-full text-center relative shadow-lg overflow-hidden">
        {/* Title */}
        <h2 className="text-stone-800 text-sm sm:text-base font-normal tracking-[0.25em] mb-6">
          <RedactedText trigger={isRedacting} delay={1.3} duration={0.75}>
            <ScrambleText text="互動說明" trigger={isOpen} delay={150} duration={1000} />
          </RedactedText>
        </h2>

        {/* Concept and Instructions - Zero layout shift guaranteed, no scrollbars */}
        <div className="text-stone-600 text-xs sm:text-sm font-light tracking-widest leading-relaxed text-left space-y-4 mb-8 overflow-hidden select-none">
          <p className="m-0 p-0">
            <RedactedText trigger={isRedacting} delay={0.04} duration={0.75}>全世界每天產生約 </RedactedText><RedactedText trigger={isRedacting} delay={0.1} duration={0.75}>3.5 億位元資訊，</RedactedText><RedactedText trigger={isRedacting} delay={0.16} duration={0.75}>物質質量約為 </RedactedText><RedactedText trigger={isRedacting} delay={0.22} duration={0.75}><span className="font-mono">8.93 × 10<sup className="text-[0.65em] align-super leading-none">-14</sup></span> 公克，</RedactedText><RedactedText trigger={isRedacting} delay={0.28} duration={0.75}>平均生成 1 位元</RedactedText><RedactedText trigger={isRedacting} delay={0.34} duration={0.75}>僅約 0.02 秒。</RedactedText><RedactedText trigger={isRedacting} delay={0.4} duration={0.75}>在龐大數據中，</RedactedText><RedactedText trigger={isRedacting} delay={0.46} duration={0.75}>表達主觀</RedactedText><span className="m-0 p-0">情感</span><RedactedText trigger={isRedacting} delay={0.52} duration={0.75}>的字詞因缺乏</RedactedText><RedactedText trigger={isRedacting} delay={0.58} duration={0.75}>流通效益，屬於系統</RedactedText><span className="m-0 p-0">所</span><RedactedText trigger={isRedacting} delay={0.64} duration={0.75}>認定無效冗餘的存</RedactedText><span className="m-0 p-0">在</span><RedactedText trigger={isRedacting} delay={0.7} duration={0.75}>。</RedactedText>
          </p>

          <p className="m-0 p-0">
            <RedactedText trigger={isRedacting} delay={0.76} duration={0.75}>本系統將分析</RedactedText><RedactedText trigger={isRedacting} delay={0.82} duration={0.75}>接收字元，</RedactedText><RedactedText trigger={isRedacting} delay={0.88} duration={0.75}>提取最具利用效能</RedactedText><RedactedText trigger={isRedacting} delay={0.94} duration={0.75}>的關鍵詞，</RedactedText><span className="m-0 p-0">並</span><RedactedText trigger={isRedacting} delay={1.0} duration={0.75}>換算</RedactedText><span className="m-0 p-0">非</span><RedactedText trigger={isRedacting} delay={1.06} duration={0.75}>關鍵詞的</RedactedText><span className="m-0 p-0">剩餘</span><RedactedText trigger={isRedacting} delay={1.12} duration={0.75}>文字質量，判定無</RedactedText><span className="m-0 p-0">價值之</span><RedactedText trigger={isRedacting} delay={1.18} duration={0.75}>文字，予以清空</RedactedText><span className="m-0 p-0">處</span><RedactedText trigger={isRedacting} delay={1.24} duration={0.75}>理。</RedactedText>
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
