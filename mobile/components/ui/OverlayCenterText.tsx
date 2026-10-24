"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { DispatchPayload, useSocket, getOrCreateDeviceUUID } from "../socket/SocketManager";
import {
  usePerformanceTimeline,
  TimelinePhase,
} from "../timeline/PerformanceTimeline";
import { getSeedPresetForDevice } from "@/config/seedPresets";
import { calculateTextBits, bitsToMassInGrams } from "@/utils/physics";

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

function getSelectiveBackspacingDelay(baseDeleteSpeed: number = 38): number {
  return Math.max(25, Math.round(baseDeleteSpeed + (Math.random() * 16 - 8)));
}

function getKeywordRecognitionPause(): number {
  return Math.round(180 + Math.random() * 80);
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
    phaseTime,
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
  const [residualText, setResidualText] = useState<string>("");
  const [isGlitchActive, setIsGlitchActive] = useState<boolean>(false);

  // 配合第 12 秒第一次閃爍進入點與第 18 秒第二次閃爍（單位突變 bits → g）進入點，各觸發 180ms 的反相閃爍與故障效果
  useEffect(() => {
    if (phase === TimelinePhase.PHASE_2_RUPTURE || phase === TimelinePhase.PHASE_3_ERASE) {
      setIsGlitchActive(true);
      const timer = setTimeout(() => {
        setIsGlitchActive(false);
      }, 180);
      return () => clearTimeout(timer);
    } else {
      setIsGlitchActive(false);
    }
  }, [phase]);

  // 動態推算當前畫面字串內容（純函式依賴狀態計算，杜絕 NaN / undefined）
  const visibleContent = useMemo(() => {
    if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
      return beforeCursor;
    }
    if (phase === TimelinePhase.PHASE_2_RUPTURE) {
      return activeText;
    }
    if (phase === TimelinePhase.PHASE_3_ERASE) {
      return residualText || activeText;
    }
    // Phase 4 殘留懸空：定格於關鍵字之最終殘留純字串
    return residualText || (activeKeywords.length > 0 ? activeKeywords.join("") : activeText);
  }, [phase, beforeCursor, residualText, activeText, activeKeywords]);

  // 純函式計算當前所佔位元數 (B bits)，中文 24 bits (3 bytes)，ASCII 8 bits (1 byte)
  const currentBits = useMemo(() => {
    return calculateTextBits(visibleContent);
  }, [visibleContent]);

  // 純函式計算對應之微觀物理質量 (m = B * 3.19e-35 g)
  const currentMass = useMemo(() => {
    return bitsToMassInGrams(currentBits);
  }, [currentBits]);

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
    // 數據列即時顯示 {B} bits 向上遞增跳動
    // ========================================================================
    if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
      setBeforeCursor("");
      setAfterCursor("");
      setResidualText("");
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
    // Phase 2 (12.0s – 18.0s，由 3 秒延長為 6 秒)：關鍵字凝固凝視
    // 12.0s 第一次反相閃爍，3D 網絡與中央關鍵字同步浮現
    // 此階段嚴禁切換公克，下方數值與 3D 標籤維持顯示 {B} bits 整整 6 秒
    // 2D 文字維持在畫面上，與背景 3D 浮現的關鍵字對照
    // ========================================================================
    else if (phase === TimelinePhase.PHASE_2_RUPTURE) {
      setBeforeCursor(activeText);
      setAfterCursor("");
      setResidualText(activeText);
      setShowCursor(true);
    }

    // ========================================================================
    // Phase 3 (18.0s – 22.5s，由 6 秒縮短為 4.5 秒)：倒退抹消與失重
    // 18.0s 第二次反相閃爍瞬間，單位正式突變為微觀質量 {m} g
    // 加快非關鍵文字的倒退刪除節奏，遇到 keywords 跳過不刪，數值動態遞減至殘留關鍵字重量
    // ========================================================================
    else if (phase === TimelinePhase.PHASE_3_ERASE) {
      setShowCursor(true);
      setResidualText(activeText);

      const segments: TextSegment[] = parseTextSegments(activeText, activeKeywords).map(
        (s) => ({ ...s })
      );

      const nonKwChars = segments
        .filter((s) => !s.isKeyword)
        .reduce((sum, s) => sum + s.text.length, 0);

      // 基準刪除速率：加快節奏，確保在 3.2~3.6 秒內乾淨抹除非關鍵字 (Phase 3 總長為 4.5s)
      const baseDelSpeed = Math.max(
        25,
        Math.min(55, Math.floor(3200 / Math.max(1, nonKwChars)))
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

          // 同步更新當前殘留純字串，微觀質量同步動態遞減
          const remainingChars = segments.map((s) => s.text).join("");
          setResidualText(remainingChars);

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

          const finalResidualStr =
            finalKw.length > 0 ? finalKw.join("") : activeKeywords.join("");

          setBeforeCursor(finalText);
          setAfterCursor("");
          setResidualText(finalResidualStr);
        }
      };

      const initialDelay = getSelectiveBackspacingDelay(baseDelSpeed);
      safeTimeout(backspaceStep, initialDelay);
    }

    // ========================================================================
    // Phase 4 (22.5s – 25.0s 及後續常駐，長度 2.5 秒)：殘留與懸空
    // 2D 浮層只孤立保留被萃取的 3～5 個關鍵字，定格於最終質量
    // 25.0s 準時觸發 DEVICE_IDLE 回報伺服器，畫面持續停留在此狀態，絕不刷白
    // ========================================================================
    else if (phase === TimelinePhase.PHASE_4_RESIDUAL) {
      const remainingKeywordsText = activeKeywords.join("   ");
      const residualPureKeywords = activeKeywords.join("");
      setBeforeCursor(remainingKeywordsText);
      setAfterCursor("");
      setResidualText(residualPureKeywords);
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
    <>
      {/* 畫面反相故障／閃爍（Glitch Flash）瞬間特效 (約 120~180ms) */}
      {isGlitchActive && (
        <div
          className="fixed inset-0 z-50 pointer-events-none mix-blend-difference bg-white animate-pulse"
          style={{ animationDuration: "120ms" }}
        />
      )}

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none select-none px-4 gap-3">
        {/* 1. 黑底容器範圍收縮：只保留給訊息文字本身 */}
        <div
          className={`max-w-[88vw] min-w-[260px] px-6 py-3.5 bg-black/85 backdrop-blur-md border rounded-sm shadow-2xl transition-all duration-300 flex items-center justify-center text-center ${isGlitchActive ? "animate-mutation-glitch border-white/80" : "border-white/20"
            }`}
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

        {/* 2. 數據列移至黑底之外：置於黑色訊息卡片正下方，置中純黑字，無任何背景底色或邊框，徹底移除冗餘前綴標籤 */}
        <div className="w-full text-center select-none pt-1">
          <div className="inline-block font-semibold text-base sm:text-lg tracking-[0.25em] text-black font-semibold tabular-nums">
            {phase === TimelinePhase.PHASE_1_ACCUMULATE || phase === TimelinePhase.PHASE_2_RUPTURE ? (
              <span>{currentBits.toLocaleString()} bits</span>
            ) : (
              <span>
                <span>{currentMass.mantissa} × 10</span>
                <sup className="text-[10px] -top-1 ml-0.5 font-bold">{currentMass.exponent}</sup>
                <span className="ml-1 font-sans">g</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
