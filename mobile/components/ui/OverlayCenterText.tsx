"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { DispatchPayload, useSocket, getOrCreateDeviceUUID } from "../socket/SocketManager";
import {
  usePerformanceTimeline,
  TimelinePhase,
} from "../timeline/PerformanceTimeline";
import { getSeedPresetForDevice } from "@/config/seedPresets";

export interface OverlayCenterTextProps {
  payload?: DispatchPayload | null;
  text?: string;
  defaultText?: string;
}

interface TextSegment {
  text: string;
  isKeyword: boolean;
}

interface MatchRange {
  start: number;
  end: number;
  word: string;
}

const PUNCTUATION_SET = new Set([
  '，', '、', '。', '！', '？', '…', '—', '～', '：', '；',
  ',', '.', '!', '?', ';', ':', ' ', '\n', '\t',
  '“', '”', '‘', '’', '（', '）', '【', '】', '《', '》',
  '"', "'", '(', ')', '[', ']', '<', '>', '/', '\\', '|',
  '-', '_', '=', '+', '*', '&', '%', '$', '#', '@', '~', '`'
]);

function isPunctuationOrSeparator(char: string): boolean {
  if (!char) return false;
  return PUNCTUATION_SET.has(char) || /\s/.test(char);
}

function getHumanizedTypingDelay(charJustTyped: string, baseSpeed: number = 115): number {
  let delay = baseSpeed + (Math.random() * 40 - 20);
  delay = Math.max(35, delay);

  if (isPunctuationOrSeparator(charJustTyped)) {
    const hesitation = 400 + Math.random() * 250;
    delay += hesitation;
  }

  return Math.round(delay);
}

function getSelectiveBackspacingDelay(baseDeleteSpeed: number = 55): number {
  return Math.max(30, Math.round(baseDeleteSpeed + (Math.random() * 20 - 10)));
}

function getKeywordRecognitionPause(): number {
  return Math.round(250 + Math.random() * 100);
}

function parseTextSegments(text: string, keywords: string[]): TextSegment[] {
  if (!text) return [];
  if (!keywords || keywords.length === 0) {
    return [{ text, isKeyword: false }];
  }

  const uniqueKeywords = Array.from(
    new Set(keywords.filter((k) => typeof k === "string" && k.trim().length > 0))
  ).sort((a, b) => b.length - a.length);

  const matches: MatchRange[] = [];
  for (const kw of uniqueKeywords) {
    let searchStart = 0;
    while (searchStart < text.length) {
      const idx = text.indexOf(kw, searchStart);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + kw.length, word: kw });
      searchStart = idx + kw.length;
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const nonOverlapping: MatchRange[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  if (nonOverlapping.length === 0) {
    return [{ text, isKeyword: false }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const m of nonOverlapping) {
    if (m.start > cursor) {
      segments.push({
        text: text.slice(cursor, m.start),
        isKeyword: false,
      });
    }
    segments.push({
      text: text.slice(m.start, m.end),
      isKeyword: true,
    });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      isKeyword: false,
    });
  }

  return segments;
}

export default function OverlayCenterText({
  payload: propPayload,
  text: propText,
  defaultText = "城市在灰色迷霧中沉睡，我們每天重複著無感的剩餘價值。",
}: OverlayCenterTextProps) {
  const {
    phase,
    payload: timelinePayload,
    cycleIndex,
  } = usePerformanceTimeline();
  const { deviceUuid } = useSocket();

  const seedPreset = getSeedPresetForDevice(
    deviceUuid || (typeof window !== "undefined" ? getOrCreateDeviceUUID() : "")
  );

  const activePayload = propPayload !== undefined ? propPayload : timelinePayload;
  const activeText =
    activePayload?.originalText || propText || seedPreset?.originalText || defaultText;
  const activeKeywords =
    activePayload?.keywords && activePayload.keywords.length > 0
      ? activePayload.keywords
      : seedPreset?.keywords || [];

  const [beforeCursor, setBeforeCursor] = useState<string>("");
  const [afterCursor, setAfterCursor] = useState<string>("");
  const [showCursor, setShowCursor] = useState<boolean>(true);

  const timersRef = useRef<Array<NodeJS.Timeout>>([]);
  const activeGenerationRef = useRef<number>(0);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const safeTimeout = useCallback((fn: () => void, delay: number) => {
    const timer = setTimeout(fn, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  useEffect(() => {
    const currentGen = ++activeGenerationRef.current;
    clearAllTimers();

    // ========================================================================
    // Phase 1 (0.0s – 12.0s，長度 12 秒)：沉澱凝視
    // 以舒適、有呼吸感的擬人節奏打出全文，約在第 9~10 秒打完，
    // 隨後在純白畫面上靜止停留約 2 秒，營造出重量壓到最底的凝視感
    // ========================================================================
    if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
      setBeforeCursor("");
      setAfterCursor("");
      setShowCursor(true);

      const targetText = activeText;
      let charIdx = 0;

      // 依字數微調打字基準速度，目標在第 9.5 秒（9~10 秒區間）完成打字
      let pCount = 0;
      for (let i = 0; i < targetText.length; i++) {
        if (isPunctuationOrSeparator(targetText[i])) pCount++;
      }
      const totalPunctDelay = pCount * 550;
      const availableCharTime = Math.max(3500, 9500 - totalPunctDelay);
      const baseSpeed = Math.max(
        40,
        Math.min(135, Math.floor(availableCharTime / Math.max(1, targetText.length)))
      );

      const typeStep = () => {
        if (activeGenerationRef.current !== currentGen) return;

        charIdx++;
        const charJustTyped = targetText[charIdx - 1];
        setBeforeCursor(targetText.slice(0, charIdx));
        setAfterCursor("");

        if (charIdx < targetText.length) {
          const delay = getHumanizedTypingDelay(charJustTyped, baseSpeed);
          safeTimeout(typeStep, delay);
        } else {
          // 約 9~10 秒打完，在畫面上靜止停留 2 秒凝視
          setShowCursor(true);
        }
      };

      const initialDelay = Math.round(120 + Math.random() * 60);
      safeTimeout(typeStep, initialDelay);
    }

    // ========================================================================
    // Phase 2 (12.0s – 15.0s，長度 3 秒)：演算法斷裂與關鍵字爆發
    // 2D 文字維持在畫面上，與背景 3D 炸出的關鍵字短暫重疊對照，不進行任何刪除
    // ========================================================================
    else if (phase === TimelinePhase.PHASE_2_RUPTURE) {
      setBeforeCursor(activeText);
      setAfterCursor("");
      setShowCursor(true);
    }

    // ========================================================================
    // Phase 3 (15.0s – 21.0s，長度 6 秒)：倒退抹消與失重
    // 從第 15 秒啟動倒退刪除（45~75ms），遇到屬於 keywords 詞彙跳過不刪（停頓 250~350ms）
    // ========================================================================
    else if (phase === TimelinePhase.PHASE_3_ERASE) {
      setShowCursor(true);

      const segments: TextSegment[] = parseTextSegments(activeText, activeKeywords).map(
        (s) => ({ ...s })
      );

      const nonKwChars = segments
        .filter((s) => !s.isKeyword)
        .reduce((sum, s) => sum + s.text.length, 0);

      // 基準刪除速率：確保在 4.5~5.0 秒內乾淨抹除非關鍵字
      const baseDelSpeed = Math.max(
        40,
        Math.min(75, Math.floor(4500 / Math.max(1, nonKwChars)))
      );

      const backspaceStep = () => {
        if (activeGenerationRef.current !== currentGen) return;

        let targetIdx = -1;
        for (let i = segments.length - 1; i >= 0; i--) {
          if (!segments[i].isKeyword && segments[i].text.length > 0) {
            targetIdx = i;
            break;
          }
        }

        if (targetIdx !== -1) {
          segments[targetIdx].text = segments[targetIdx].text.slice(0, -1);

          const leftText =
            segments.slice(0, targetIdx).map((s) => s.text).join("") +
            segments[targetIdx].text;

          const rightKeywords = segments
            .slice(targetIdx + 1)
            .filter((s) => s.isKeyword && s.text.length > 0)
            .map((s) => s.text);

          const rightText =
            rightKeywords.length > 0 ? " " + rightKeywords.join(" ") : "";

          setBeforeCursor(leftText);
          setAfterCursor(rightText);

          let nextDelay = getSelectiveBackspacingDelay(baseDelSpeed);

          if (segments[targetIdx].text.length === 0) {
            let hasMoreLeft = false;
            for (let i = targetIdx - 1; i >= 0; i--) {
              if (!segments[i].isKeyword && segments[i].text.length > 0) {
                hasMoreLeft = true;
                break;
              }
            }
            if (hasMoreLeft) {
              nextDelay = getKeywordRecognitionPause();
            }
          }

          safeTimeout(backspaceStep, nextDelay);
        } else {
          const finalKw = segments
            .filter((s) => s.isKeyword && s.text.length > 0)
            .map((s) => s.text);

          const finalText =
            finalKw.length > 0 ? finalKw.join(" ") : activeKeywords.join(" ");

          setBeforeCursor(finalText);
          setAfterCursor("");
        }
      };

      const initialDelay = getSelectiveBackspacingDelay(baseDelSpeed);
      safeTimeout(backspaceStep, initialDelay);
    }

    // ========================================================================
    // Phase 4 (21.0s – 25.0s，長度 4 秒)：殘留與懸空
    // 2D 浮層只孤立保留被萃取的 3～5 個關鍵字，無聲停滯於畫面中央
    // ========================================================================
    else if (phase === TimelinePhase.PHASE_4_RESIDUAL) {
      const remainingKeywordsText = activeKeywords.join("   ");
      setBeforeCursor(remainingKeywordsText);
      setAfterCursor("");
      setShowCursor(false);
    }

    return () => {
      clearAllTimers();
    };
  }, [
    phase,
    cycleIndex,
    activeText,
    activeKeywords,
    clearAllTimers,
    safeTimeout,
  ]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none px-4">
      <div
        className="max-w-[88vw] px-5 py-3 bg-black/85 backdrop-blur-md border border-white/20 rounded-sm shadow-2xl transition-all duration-300"
        style={{
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <span className="font-mono text-base sm:text-lg tracking-[0.35em] text-white uppercase font-medium inline-block text-center break-words leading-relaxed">
          <span>{beforeCursor}</span>
          {showCursor && (
            <span className="inline-block animate-pulse ml-0.5 opacity-90 text-white">_</span>
          )}
          <span>{afterCursor}</span>
        </span>
      </div>
    </div>
  );
}
