"use client";

import { useState } from "react";
import { Turnstile } from "@marsstrikes/react-turnstile";
import ScrambleText from "@/components/ScrambleText";

interface GateModalProps {
  isOpen: boolean;
  onPassGate: (token: string) => void;
}

export default function GateModal({ isOpen, onPassGate }: GateModalProps) {
  const [token, setToken] = useState("");
  const [isLeaving, setIsLeaving] = useState(false);

  if (!isOpen) return null;

  const handleSuccess = (t: string) => {
    setToken(t);
    // Wait 3 seconds (3000ms) after verification succeeds before auto-transitioning
    setTimeout(() => {
      setIsLeaving(true);
      setTimeout(() => {
        onPassGate(t);
        setIsLeaving(false);
      }, 400);
    }, 3000);
  };

  const handleEnter = () => {
    if (!token) return;
    setIsLeaving(true);
    setTimeout(() => {
      onPassGate(token);
      setIsLeaving(false);
    }, 400);
  };

  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || "1x00000000000000000000AA";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 select-none transition-opacity duration-500 ease-out ${
        isLeaving ? "opacity-0 pointer-events-none" : "opacity-100 animate-fade-in"
      }`}
    >
      <div className="bg-[#222222] border border-stone-800 p-8 max-w-md w-full text-center relative shadow-2xl flex flex-col items-center gap-6 rounded-sm">
        {/* Header */}
        <div className="flex flex-col gap-2 items-center">
          <h2 className="text-stone-100 text-sm sm:text-base font-normal tracking-[0.3em] uppercase">
            <ScrambleText text="安全入口驗證" trigger={isOpen} delay={100} duration={800} />
          </h2>
          <p className="text-stone-400 text-[10px] tracking-[0.25em] uppercase font-mono">
            SECURITY GATE ACCESS
          </p>
        </div>

        {/* Description / Hint */}
        <div className="text-stone-300 text-xs font-light tracking-widest leading-relaxed">
          歡迎來到《那些文字已經無關緊要了》展演空間。請先完成以下無感驗證以進入作品體驗。
        </div>

        {/* Turnstile Widget */}
        <div className="flex justify-center w-full min-h-[65px] my-2 select-none bg-[#222222]">
          <Turnstile
            siteKey={siteKey}
            options={{ theme: "dark" }}
            onSuccess={handleSuccess}
            onExpire={() => setToken("")}
            onError={() => setToken("")}
          />
        </div>

        {/* Status / Enter Button */}
        <button
          type="button"
          onClick={handleEnter}
          disabled={!token}
          className={`w-full py-3.5 bg-stone-100 text-stone-900 font-light tracking-[0.3em] text-xs transition-all duration-300 focus:outline-none ${
            !token
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-stone-200 cursor-pointer shadow-md"
          }`}
        >
          {token ? (
            "驗證成功，即將進入展演空間..."
          ) : (
            <ScrambleText
              text="進行無感驗證中..."
              trigger={isOpen}
              delay={300}
              duration={800}
            />
          )}
        </button>
      </div>
    </div>
  );
}



