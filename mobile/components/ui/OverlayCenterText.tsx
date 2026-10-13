"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSocket, DispatchPayload } from "../socket/SocketManager";

export interface OverlayCenterTextProps {
  /** 手動傳入 payload（若無則自動使用 Socket 派發之 currentPayload） */
  payload?: DispatchPayload | null;
  /** 手動傳入文字（相容舊版本介面） */
  text?: string;
  /** 自訂打字機基準速率（毫秒/字元，若未設定則自動使用 100~130ms 隨機有機節奏） */
  typingSpeed?: number;
  /** 自訂倒退刪除基準速率（毫秒/字元，若未設定則自動使用 45~75ms 隨機有機節奏） */
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
 * 判定字元是否為標點符號或分隔符（，、。、！、？、、、空格、換行等）
 */
const PUNCTUATION_SET = new Set([
  '，', '、', '。', '！', '？', '…', '—', '～', '：', '；',
  ',', '.', '!', '?', ';', ':', ' ', '\n', '\t'
]);

function isPunctuationOrSeparator(char: string): boolean {
  if (!char) return false;
  return PUNCTUATION_SET.has(char) || /[\s\p{P}]/u.test(char);
}

/**
 * 1. 打字階段動態（Humanized Typing）延遲計算
 * 基準隨機延遲：每字基準約 100ms ~ 130ms
 * 隨機浮動：delay = baseDelay + Math.random() * 80 - 40
 * 標點停頓（Thinking Hesitation）：遇到標點符號額外加入 400ms ~ 650ms 思考停頓
 */
function getHumanizedTypingDelay(charJustTyped: string, customBaseSpeed?: number): number {
  const baseDelay =
    customBaseSpeed !== undefined ? customBaseSpeed : 100 + Math.random() * 30;
  let delay = baseDelay + (Math.random() * 80 - 40);
  delay = Math.max(30, delay);

  if (isPunctuationOrSeparator(charJustTyped)) {
    const hesitation = 400 + Math.random() * 250;
    delay += hesitation;
  }

  return Math.round(delay);
}

/**
 * 2. 倒退刪除階段動態（Selective Backspacing）延遲計算
 * 刪除節奏：每字約 45ms ~ 75ms
 */
function getSelectiveBackspacingDelay(customDeleteSpeed?: number): number {
  if (customDeleteSpeed !== undefined) {
    return Math.max(20, Math.round(customDeleteSpeed + (Math.random() * 20 - 10)));
  }
  return Math.round(45 + Math.random() * 30);
}

/**
 * 關鍵字識別停頓（Keyword Hesitation Pause）
 * 當倒退刪除碰到需要保留的關鍵字時，在此節點短暫停頓 250ms ~ 350ms
 */
function getKeywordRecognitionPause(): number {
  return Math.round(250 + Math.random() * 100);
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
  typingSpeed,
  backspaceSpeed,
  holdDuration = 1500,
  endPauseDuration = 2000,
  defaultText = "[ web view ]",
}: OverlayCenterTextProps) {
  const { currentPayload: socketPayload, reportIdle } = useSocket();

  // 判定目前生效的 Payload 與文字內容（未被派發到的裝置維持空文字與預設畫面）
  const activePayload = propPayload !== undefined ? propPayload : socketPayload;
  const activeText = activePayload?.originalText || propText || "";
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
   * 執行完整 5 階段視覺演繹狀態機（有機動態節奏）
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
      // Step 1: 打字階段動態 (Humanized Typing - 遞迴 setTimeout)
      // 從左至右逐字吐出 originalText，閃爍游標 _
      // ====================================================================
      setBeforeCursor("");
      setAfterCursor("");
      setShowCursor(true);

      let charIdx = 0;
      const typeNextChar = () => {
        if (generationRef.current !== currentGen) return;

        charIdx++;
        const charJustTyped = textToPlay[charIdx - 1];
        setBeforeCursor(textToPlay.slice(0, charIdx));
        setAfterCursor("");

        if (charIdx < textToPlay.length) {
          // 基準 100~130ms + 隨機浮動 ±40ms + 標點符號額外思考停頓 400~650ms
          const nextCharDelay = getHumanizedTypingDelay(charJustTyped, typingSpeed);
          safeTimeout(typeNextChar, nextCharDelay);
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

      // 啟動第一個字元的打字延遲
      const initialTypeDelay = Math.round(100 + Math.random() * 30);
      safeTimeout(typeNextChar, initialTypeDelay);

      // ====================================================================
      // Step 3: 智慧倒退刪除階段動態 (Selective Backspacing - 遞迴 setTimeout)
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

            // 判斷下一次刪除的延遲時間
            let nextDelay = getSelectiveBackspacingDelay(backspaceSpeed);

            // 若當前非關鍵字區塊已剛好被完全清空
            if (segments[targetIdx].text.length === 0) {
              // 檢查左側是否還有未刪除的非關鍵字區塊
              let hasMoreLeftToDelete = false;
              for (let i = targetIdx - 1; i >= 0; i--) {
                if (!segments[i].isKeyword && segments[i].text.length > 0) {
                  hasMoreLeftToDelete = true;
                  break;
                }
              }

              // 若左側還有非關鍵字需刪除，代表此時游標正迎面碰到並跳過位於中間的保留關鍵字
              // 在此節點短暫停頓 250ms ~ 350ms，做出詞彙被挑選留下的頓挫感
              if (hasMoreLeftToDelete) {
                nextDelay = getKeywordRecognitionPause();
              }
            }

            safeTimeout(backspaceStep, nextDelay);
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

        // 啟動倒退刪除：若句子尾部本身就是關鍵字，初始時就直接碰到關鍵字，先進行短暫頓挫停頓
        let initialDeleteDelay = getSelectiveBackspacingDelay(backspaceSpeed);
        if (segments.length > 0 && segments[segments.length - 1].isKeyword) {
          initialDeleteDelay = getKeywordRecognitionPause();
        }

        safeTimeout(backspaceStep, initialDeleteDelay);
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
