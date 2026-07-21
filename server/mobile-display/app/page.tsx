"use client";

import { useState, useCallback, useRef } from "react";
import SocketManager from "@/components/SocketManager";
import MessageDisplay, { DisplayMessageData } from "@/components/MessageDisplay";
import CountdownTimer from "@/components/CountdownTimer";
import { DEFAULT_DISPLAY_DURATION_SEC } from "@/config/constants";

export default function Home() {
  const [currentMessage, setCurrentMessage] = useState<DisplayMessageData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const requestNextFnRef = useRef<(() => void) | null>(null);

  const handleMessageReceived = useCallback((data: DisplayMessageData) => {
    setCurrentMessage(data);
    setIsLoading(false);
  }, []);

  const handleRequestNextRef = useCallback((requestFn: () => void) => {
    requestNextFnRef.current = requestFn;
  }, []);

  const handleCountdownComplete = useCallback(() => {
    setIsLoading(true);
    if (requestNextFnRef.current) {
      requestNextFnRef.current();
    }
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#faf9f6] text-neutral-900 flex flex-col justify-between p-6 sm:p-12 select-none relative font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between w-full max-w-xl mx-auto pt-2 pb-4 border-b border-neutral-200/60">
        <h1 className="text-xs font-mono tracking-[0.25em] text-neutral-500 uppercase">
          Aphasia Display
        </h1>
        <SocketManager
          onMessageReceived={handleMessageReceived}
          onRequestNextRef={handleRequestNextRef}
        />
      </header>

      {/* Main Content */}
      <section className="flex-1 flex flex-col items-center justify-center my-8 w-full">
        <MessageDisplay message={currentMessage} isLoading={isLoading} />

        {currentMessage && !isLoading && (
          <CountdownTimer
            durationSec={currentMessage.durationSec || DEFAULT_DISPLAY_DURATION_SEC}
            messageKey={currentMessage.id || currentMessage.timestamp}
            onComplete={handleCountdownComplete}
          />
        )}
      </section>

      {/* Footer */}
      <footer className="w-full text-center py-3 text-[10px] font-mono text-neutral-400 tracking-widest uppercase border-t border-neutral-200/60 max-w-xl mx-auto">
        Those Words No Longer Matter • 畫面那些文字已經無關緊要了
      </footer>
    </main>
  );
}
