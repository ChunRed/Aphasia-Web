"use client";

import React, { useEffect, useState } from "react";

interface ScrambleTextProps {
  text: string;
  trigger?: boolean;
  delay?: number;
  duration?: number;
  speed?: number;
  characters?: string;
  className?: string;
  as?: React.ElementType;
  periodicGlitch?: boolean;
  glitchIntervalMin?: number;
  glitchIntervalMax?: number;
}

const DEFAULT_CHINESE_CHARS =
  "文字聲響無關緊要意念符號記憶痕跡█▧▌□◨⊠⊟◘▪▫▇▅◪■▛▜▝▞▟▙▚▘▗𖦹𖣯☡";
const DEFAULT_ASCII_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/";

const PIXEL_GLITCH_CHARS = "█▧▌□◨⊠⊟◘▪▫▇▅◪■▛▜▝▞▟▙▚▘▗𖦹𖣯☡";

// Helper to check if string contains Chinese / full-width characters
function hasChinese(str: string): boolean {
  return /[\u4e00-\u9fa5]/.test(str);
}

export default function ScrambleText({
  text,
  trigger = true,
  delay = 0,
  duration = 1800,
  speed = 50,
  characters,
  className = "",
  as: Component = "span",
  periodicGlitch = false,
  glitchIntervalMin = 2500,
  glitchIntervalMax = 5500,
}: ScrambleTextProps) {
  const [charList, setCharList] = useState<string[]>([]);
  const [glitchedIndices, setGlitchedIndices] = useState<Set<number>>(new Set());
  const [isSettled, setIsSettled] = useState(false);

  const activeChars =
    characters || (hasChinese(text) ? DEFAULT_CHINESE_CHARS : DEFAULT_ASCII_CHARS);

  // 1. Initial entrance scramble
  useEffect(() => {
    if (!trigger) {
      setCharList([]);
      setIsSettled(false);
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    timeoutId = setTimeout(() => {
      const length = text.length;
      if (length === 0) return;

      let frame = 0;
      const totalFrames = Math.max(1, Math.floor(duration / speed));

      intervalId = setInterval(() => {
        frame++;
        const progress = frame / totalFrames;
        const revealedCount = Math.floor(progress * length);

        const current: string[] = [];
        for (let i = 0; i < length; i++) {
          const char = text[i];
          if (char === " " || char === "\n" || char === "（" || char === "）" || char === "/") {
            current.push(char);
          } else if (i < revealedCount) {
            current.push(char);
          } else {
            const randomChar =
              activeChars[Math.floor(Math.random() * activeChars.length)];
            current.push(randomChar);
          }
        }

        setCharList(current);

        if (frame >= totalFrames) {
          setCharList(text.split(""));
          setIsSettled(true);
          clearInterval(intervalId);
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [trigger, text, delay, duration, speed, activeChars]);

  // 2. Periodic subtle glitch & pixelation effect after settled
  useEffect(() => {
    if (!isSettled || !periodicGlitch || text.length === 0) return;

    let timerId: NodeJS.Timeout;
    let burstIntervalId: NodeJS.Timeout;
    let stopBurstTimeoutId: NodeJS.Timeout;

    const scheduleNextGlitch = () => {
      const randomWait =
        Math.floor(Math.random() * (glitchIntervalMax - glitchIntervalMin)) +
        glitchIntervalMin;

      timerId = setTimeout(() => {
        const validIndices = text
          .split("")
          .map((c, idx) => (c !== " " && c !== "\n" && c !== "/" ? idx : -1))
          .filter((idx) => idx !== -1);

        if (validIndices.length === 0) return;

        // Choose 1 or 2 random positions
        const count = Math.random() > 0.6 ? 2 : 1;
        const targetIndices: number[] = [];
        for (let k = 0; k < count; k++) {
          const randIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
          if (!targetIndices.includes(randIdx)) {
            targetIndices.push(randIdx);
          }
        }

        setGlitchedIndices(new Set(targetIndices));

        // Rapidly shuffle characters at target positions during glitch burst
        const burstDuration = Math.floor(Math.random() * 200) + 150; // 150ms - 350ms
        const burstSpeed = 40;

        burstIntervalId = setInterval(() => {
          setCharList((prev) => {
            const next = [...prev];
            targetIndices.forEach((idx) => {
              const pool = PIXEL_GLITCH_CHARS + activeChars;
              next[idx] = pool[Math.floor(Math.random() * pool.length)];
            });
            return next;
          });
        }, burstSpeed);

        stopBurstTimeoutId = setTimeout(() => {
          clearInterval(burstIntervalId);
          setGlitchedIndices(new Set());
          setCharList(text.split(""));
          scheduleNextGlitch();
        }, burstDuration);
      }, randomWait);
    };

    scheduleNextGlitch();

    return () => {
      clearTimeout(timerId);
      clearInterval(burstIntervalId);
      clearTimeout(stopBurstTimeoutId);
    };
  }, [isSettled, periodicGlitch, text, glitchIntervalMin, glitchIntervalMax, activeChars]);

  if (!trigger) return null;

  return (
    <Component className={className}>
      {charList.map((char, index) => {
        const isGlitched = glitchedIndices.has(index);
        return (
          <span
            key={index}
            className={
              isGlitched
                ? "inline-block text-stone-600 opacity-80 filter blur-[0.4px] scale-95 transition-all duration-75 font-mono"
                : ""
            }
          >
            {char}
          </span>
        );
      })}
    </Component>
  );
}

