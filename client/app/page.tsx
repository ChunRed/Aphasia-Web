"use client";

import { useState } from "react";
import MujiInput from "@/components/MujiInput";
import IntroModal from "@/components/IntroModal";
import GateModal from "@/components/GateModal";
import ScrambleText from "@/components/ScrambleText";

export default function Home() {
  const [isVerifiedAndPassed, setIsVerifiedAndPassed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [showIntro, setShowIntro] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  // Called when Turnstile is verified and user clicks "進入作品 / ENTER" at the Gate
  const handlePassGate = (token: string) => {
    setTurnstileToken(token);
    setIsVerifiedAndPassed(true);
    setShowIntro(true); // Open the IntroModal (操作說明)
  };

  const handleCloseIntro = () => {
    setShowIntro(false);
    setHasEntered(true);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-start md:justify-center bg-[#fafaf9] p-6 pt-20 md:pt-6 text-center select-none overflow-hidden">
      {/* Subtle background radial pattern for light mode */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Ambient soft warm light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-stone-200/20 rounded-full blur-[120px] pointer-events-none" />

      {/* 1. Security Gate Modal (安全入口閘門) */}
      <GateModal
        isOpen={!isVerifiedAndPassed}
        onPassGate={handlePassGate}
      />

      {/* 2. Main Experience View (Only unlocked after passing Gate) */}
      {isVerifiedAndPassed && (
        <>
          <main className="relative z-10 flex flex-col items-center justify-center max-w-2xl gap-8 w-full">
            <div className="flex flex-col items-center justify-center gap-4">
              <h1
                className={`text-xl sm:text-2xl md:text-3xl font-extralight tracking-[0.4em] leading-[2.2] text-stone-800 drop-shadow-sm select-text ${
                  hasEntered ? "animate-fade-in" : "opacity-0"
                }`}
              >
                <ScrambleText
                  text="那些文字已經無關緊要了"
                  trigger={hasEntered}
                  delay={200}
                  duration={1200}
                  periodicGlitch={true}
                  glitchIntervalMin={2000}
                  glitchIntervalMax={4500}
                />
              </h1>
              <div
                className={`h-[1px] bg-stone-300 mt-1 ${
                  hasEntered ? "animate-width-expand" : "w-0 opacity-0"
                }`}
              />
              <p
                className={`text-stone-500 text-[10px] sm:text-xs tracking-[0.5em] uppercase font-mono mt-1 select-text ${
                  hasEntered ? "animate-fade-in-delayed" : "opacity-0"
                }`}
              >
                <ScrambleText
                  text="Aphasia Web"
                  trigger={hasEntered}
                  delay={600}
                  duration={900}
                  periodicGlitch={true}
                  glitchIntervalMin={3500}
                  glitchIntervalMax={7000}
                />
              </p>
            </div>

            <MujiInput isVisible={hasEntered} turnstileToken={turnstileToken} />
          </main>

          {/* 3. Instruction Modal (操作說明畫面) */}
          <IntroModal
            isOpen={showIntro}
            onClose={handleCloseIntro}
            onStartExperience={() => setHasEntered(true)}
          />

          {/* Footer copyright */}
          <footer
            className={`fixed bottom-4 left-0 w-full text-center text-[10px] text-stone-400 tracking-[0.25em] font-light font-mono select-none pointer-events-none z-10 ${
              hasEntered ? "animate-fade-in-delayed opacity-70" : "opacity-0"
            }`}
          >
            <ScrambleText
              text="@ No Side Here"
              trigger={hasEntered}
              delay={900}
              duration={800}
            />
          </footer>
        </>
      )}
    </div>
  );
}




