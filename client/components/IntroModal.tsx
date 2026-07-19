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
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none transition-opacity duration-500 ease-out ${
        isClosing ? "opacity-0 pointer-events-none" : "opacity-100 animate-fade-in"
      }`}
    >
      <div className="bg-[#fafaf9] border border-stone-200 p-8 max-w-md w-full text-center relative shadow-lg">
        {/* Title */}
        <h2 className="text-stone-800 text-sm sm:text-base font-normal tracking-[0.25em] mb-6">
          <ScrambleText text="互動理念 與 操作說明" trigger={isOpen} delay={150} duration={1000} />
        </h2>

        {/* Empty placeholder paragraphs for user to edit */}
        <div className="text-stone-500 text-xs sm:text-sm font-light tracking-widest leading-loose text-left whitespace-pre-line mb-8 min-h-[160px] overflow-y-auto px-1">
          {"\n\n\n\n（此處留白，供後續填寫操作說明與互動理念）\n\n\n\n"}
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


