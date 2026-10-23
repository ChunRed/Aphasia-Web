"use client";

import { useState } from "react";
import ScrambleText from "@/components/ScrambleText";

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartExperience?: () => void;
}

export default function IntroModal({ isOpen, onClose, onStartExperience }: IntroModalProps) {
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    setIsClosing(true);
    onStartExperience?.();
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none transition-opacity duration-500 ease-out ${isClosing ? "opacity-0 pointer-events-none" : "opacity-100 animate-fade-in"
        }`}
    >
      <div className="bg-[#fafaf9] border border-stone-200 p-8 max-w-md w-full text-center relative shadow-lg">
        {/* Title */}
        <h2 className="text-stone-800 text-sm sm:text-base font-normal tracking-[0.25em] mb-6">
          <ScrambleText text="互動理念 與 操作說明" trigger={isOpen} delay={150} duration={1000} />
        </h2>

        {/* Concept and Instructions */}
        <div className="text-stone-600 text-xs sm:text-sm font-light tracking-widest leading-relaxed text-left space-y-4 mb-8 max-h-[60vh] overflow-y-auto px-1">
          <p>
            全世界每天產生約 3.5 億 Terabytes的資訊，同等物質質量約為{" "}
            <span className="font-mono font-normal">
              8.93 × 10<sup>-14</sup>
            </span>{" "}
            公克，平均生成 1 bit 資訊僅需約 0.02 秒的時間。在龐大的數據流中，純粹用於表達主觀情感的字詞經判定不具備流通效益，屬於系統內的無效冗餘。
          </p>
          <p>
            本系統將針對所接收的字元序列執行分析，提取最具使用價值的關鍵詞，並將其換算為等重物理質量，抹除其餘無關緊要的文字。
          </p>
        </div>

        {/* Button */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-stone-100 font-light tracking-[0.3em] text-xs transition-colors duration-300 focus:outline-none cursor-pointer"
        >
          <ScrambleText text="進入體驗 / ENTER" trigger={isOpen} delay={300} duration={800} />
        </button>
      </div>
    </div>
  );
}


