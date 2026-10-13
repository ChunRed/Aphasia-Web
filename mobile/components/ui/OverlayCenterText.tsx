"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSocket, DispatchPayload } from "../socket/SocketManager";

export interface OverlayCenterTextProps {
  /** 手動傳入 payload（若無則自動使用 Socket 派發之 currentPayload） */
  payload?: DispatchPayload | null;
  /** 手動傳入文字（相容舊版本介面） */
  text?: string;
  /** 打字機速率（毫秒/字元），預設 120ms（三倍慢） */
  typingSpeed?: number;
  /** 倒退刪除速率（毫秒/字元），預設 105ms（三倍慢） */
  backspaceSpeed?: number;
  /** Step 2 閱讀駐留時間（毫秒），預設 1500ms */
  holdDuration?: number;
  /** Step 4 演出結束停留時間（毫秒），預設 2000ms */
  endPauseDuration?: number;
  /** 預設顯示文字（當尚未接收到任何資料時），預設 "[ web view ]" */
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

/**
 * 將原始日記依據 Gemini 萃取出的關鍵字陣列切分為保留關鍵字區塊與非關鍵字區塊
 */
function parseTextSegments(text: string, keywords: string[]): TextSegment[] {
  if (!text) return [];
  if (!keywords || keywords.length === 0) {
    return [{ text, isKeyword: false }];
  }

  // 1. 去重並由長至短排序，避免長詞被子字串切碎
  const uniqueKeywords = Array.from(
    new Set(keywords.filter((k) => typeof k === "string" && k.trim().length > 0))
  ).sort((a, b) => b.length - a.length);

  // 2. 尋找所有關鍵字在原始文本中的位置區間
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

  // 依照起始位置排序
  matches.sort((a, b) => a.start - b.start);

  // 解決可能重疊的區間（優先保留先出現者）
  const nonOverlapping: MatchRange[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  // 若文本中未出現任何關鍵字（極端 fallback 狀況）
  if (nonOverlapping.length === 0) {
    return [{ text, isKeyword: false }];
  }

  // 3. 切割成交替的 TextSegment 清單
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
  typingSpeed = 120,
  backspaceSpeed = 105,
  holdDuration = 1500,
  endPauseDuration = 2000,
  defaultText = "[ web view ]",
}: OverlayCenterTextProps) {
  const { currentPayload: socketPayload, latestText, reportIdle } = useSocket();

  // 判定目前生效的 Payload 與文字內容
  const activePayload = propPayload !== undefined ? propPayload : socketPayload;
  const activeText = activePayload?.originalText || propText || latestText || "";
  const activeKeywords = activePayload?.keywords || [];

  // 游標左右兩側的文字（支援游標在倒退刪除過程中精確停留在退格處）
  const [beforeCursor, setBeforeCursor] = useState<string>(defaultText);
  const [afterCursor, setAfterCursor] = useState<string>("");
  const [showCursor, setShowCursor] = useState<boolean>(false);

  // 演出世代計數器，用於支援「新訊息搶佔中斷 (Preemption)」
  const generationRef = useRef<number>(0);
  const timersRef = useRef<Array<NodeJS.Timeout>>([]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const safeTimeout = useCallback((fn: () => void, delay: number) => {
    const timer = setTimeout(fn, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  /**
   * 執行完整 5 階段視覺演繹狀態機
   */
  const startLifecycle = useCallback(
    (textToPlay: string, keywordsToKeep: string[]) => {
      // 遞增 generation，即時終止前一次未完成的計時器與循環
      const currentGen = ++generationRef.current;
      clearAllTimers();

      if (!textToPlay) {
        setBeforeCursor(defaultText);
        setAfterCursor("");
        setShowCursor(false);
        return;
      }

      console.log(`[OverlayCenterText] 開始演繹生命週期 (Gen: ${currentGen}, 長度: ${textToPlay.length})`);

      // ====================================================================
      // Step 1: 打字印出 (Typing)
      // 從左至右逐字吐出 originalText，閃爍游標 _
      // ====================================================================
      setBeforeCursor("");
      setAfterCursor("");
      setShowCursor(true);

      let charIdx = 0;
      const typeNextChar = () => {
        if (generationRef.current !== currentGen) return;

        charIdx++;
        setBeforeCursor(textToPlay.slice(0, charIdx));
        setAfterCursor("");

        if (charIdx < textToPlay.length) {
          safeTimeout(typeNextChar, typingSpeed);
        } else {
          // ==================================================================
          // Step 2: 短暫駐留 (Pause/Hold)
          // 完整句子印出後，駐留約 1.5 秒讓觀眾閱讀
          // ==================================================================
          safeTimeout(() => {
            if (generationRef.current !== currentGen) return;
            startSmartBackspace();
          }, holdDuration);
        }
      };

      safeTimeout(typeNextChar, typingSpeed);

      // ====================================================================
      // Step 3: 智慧倒退刪除 (Smart Backspace - 核心效果)
      // 文字游標從字尾往前倒退刪除，遇關鍵字跳過不刪除，非關鍵字逐字退格
      // ====================================================================
      const startSmartBackspace = () => {
        if (generationRef.current !== currentGen) return;

        // 複製文字區塊陣列
        const segments: TextSegment[] = parseTextSegments(textToPlay, keywordsToKeep).map(
          (s) => ({ ...s })
        );

        const hasAnyKeyword = segments.some((s) => s.isKeyword);

        const backspaceStep = () => {
          if (generationRef.current !== currentGen) return;

          // 尋找最後一個「非關鍵字」且「文字長度 > 0」的區塊
          let targetIdx = -1;
          for (let i = segments.length - 1; i >= 0; i--) {
            if (!segments[i].isKeyword && segments[i].text.length > 0) {
              targetIdx = i;
              break;
            }
          }

          if (targetIdx !== -1) {
            // 從該非關鍵字區塊字尾刪除 1 個字元
            segments[targetIdx].text = segments[targetIdx].text.slice(0, -1);

            // 組裝游標左側文字
            const leftSegmentsText = segments
              .slice(0, targetIdx)
              .map((s) => s.text)
              .join("");
            const currentLeft = leftSegmentsText + segments[targetIdx].text;

            // 組裝游標右側已保留之關鍵字文字
            const preservedRightKeywords = segments
              .slice(targetIdx + 1)
              .filter((s) => s.isKeyword && s.text.length > 0)
              .map((s) => s.text);
            const currentRight =
              preservedRightKeywords.length > 0
                ? " " + preservedRightKeywords.join(" ")
                : "";

            setBeforeCursor(currentLeft);
            setAfterCursor(currentRight);

            safeTimeout(backspaceStep, backspaceSpeed);
          } else {
            // 所有非關鍵字刪除完畢，只剩下被萃取出的關鍵字
            const finalKeywords = segments
              .filter((s) => s.isKeyword && s.text.length > 0)
              .map((s) => s.text);

            const resultText =
              finalKeywords.length > 0
                ? finalKeywords.join(" ")
                : hasAnyKeyword
                ? ""
                : keywordsToKeep.join(" ");

            setBeforeCursor(resultText);
            setAfterCursor("");

            // ================================================================
            // Step 4: 動態結束與狀態回報
            // 倒退刪除完成、只剩關鍵字時，停頓約 2 秒，發送 DEVICE_IDLE 給 Server
            // ================================================================
            safeTimeout(() => {
              if (generationRef.current !== currentGen) return;
              console.log("[OverlayCenterText] 倒退刪除演繹完成，回報 DEVICE_IDLE");
              reportIdle();

              // ==============================================================
              // Step 5: 閒置重播循環 (Idle Loop)
              // 若 Server 暫無下一筆新訊息可派發，維持當前內容，自動重新開始重播
              // ==============================================================
              safeTimeout(() => {
                if (generationRef.current !== currentGen) return;
                console.log("[OverlayCenterText] 進入 Idle Loop 重播");
                startLifecycle(textToPlay, keywordsToKeep);
              }, 600);
            }, endPauseDuration);
          }
        };

        safeTimeout(backspaceStep, backspaceSpeed);
      };
    },
    [
      defaultText,
      typingSpeed,
      backspaceSpeed,
      holdDuration,
      endPauseDuration,
      clearAllTimers,
      safeTimeout,
      reportIdle,
    ]
  );

  // 監聽新訊息抵達：新訊息立即搶佔中斷 (Preemption) 並從頭開始演出
  const lastPayloadIdRef = useRef<string | null>(null);
  const lastTextRef = useRef<string>("");

  useEffect(() => {
    const currentId = activePayload?.id || null;

    // 當收到了新的 Payload ID，或是文字內容發生改變
    if (activeText && (currentId !== lastPayloadIdRef.current || activeText !== lastTextRef.current)) {
      lastPayloadIdRef.current = currentId;
      lastTextRef.current = activeText;
      startLifecycle(activeText, activeKeywords);
    } else if (!activeText && !lastTextRef.current) {
      setBeforeCursor(defaultText);
      setAfterCursor("");
      setShowCursor(false);
    }
  }, [activePayload, activeText, activeKeywords, defaultText, startLifecycle]);

  // 元件卸載清理
  useEffect(() => {
    return () => {
      generationRef.current++;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none px-4">
      <div
        className="max-w-[88vw] px-4 py-2 bg-black/80 backdrop-blur-md border border-white/15 rounded-sm shadow-md transition-all duration-300"
        style={{
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <span className="font-mono text-xs sm:text-sm tracking-[0.35em] text-white uppercase font-medium inline-block text-center break-words">
          <span>{beforeCursor}</span>
          {showCursor && (
            <span className="inline-block animate-pulse ml-0.5 opacity-80">_</span>
          )}
          <span>{afterCursor}</span>
        </span>
      </div>
    </div>
  );
}
