"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import ScrambleText from "@/components/ScrambleText";

interface RedactedTitleProps {
  trigger?: boolean;
  className?: string;
}

interface TitleChunk {
  id: number;
  text: string;
}

// 標題語意切塊：那些 / 文字 / 已經 / 無關 / 緊要 / 了
const CHUNKS: TitleChunk[] = [
  { id: 0, text: "那些" },
  { id: 1, text: "文字" },
  { id: 2, text: "已經" },
  { id: 3, text: "無關" },
  { id: 4, text: "緊要" },
  { id: 5, text: "了" },
];

// 預設隨機抹除組合池（涵蓋單詞、多詞交錯、長短矩形組合）
const REDACTION_PRESETS: number[][] = [
  [1, 2],        // 那些 [██] 已經無關緊要了
  [3, 4],     // 那些文字已經 [████] 了
  [0, 1],        // [██] 文字已經無關緊要了
  [1, 2, 3, 4],  // 那些 [██] 已經 [████] 了
  [2],        // 那些文字 [██] 無關緊要了
  [0, 1],     // [████] 已經無關緊要了
  [2, 3, 4],  // 那些文字 [██████] 了
  [3, 4],        // 那些文字已經 [██] 緊要了
  [4],        // 那些文字已經無關 [██] 了
  [1, 2, 3],     // 那些 [████] 無關緊要了
];

export default function RedactedTitle({ trigger = true, className = "" }: RedactedTitleProps) {
  const [activeCoveredIds, setActiveCoveredIds] = useState<number[]>([]);
  const [isCycleActive, setIsCycleActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPresetIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (!trigger) {
      setActiveCoveredIds([]);
      setIsCycleActive(false);
      return;
    }

    let isMounted = true;

    // 開場 ScrambleText 解碼完成後，稍候 2 秒啟動自主循環抹除
    const startTimeout = setTimeout(() => {
      runNextCycle();
    }, 2200);

    const runNextCycle = () => {
      if (!isMounted) return;

      // 1. 隨機選取一組與前次不同的遮蔽字詞
      let nextPresetIdx = Math.floor(Math.random() * REDACTION_PRESETS.length);
      if (nextPresetIdx === lastPresetIndexRef.current) {
        nextPresetIdx = (nextPresetIdx + 1) % REDACTION_PRESETS.length;
      }
      lastPresetIndexRef.current = nextPresetIdx;
      const targetIds = REDACTION_PRESETS[nextPresetIdx];

      // 2. 啟動黑色長方形由左至右展開遮蔽
      setActiveCoveredIds(targetIds);
      setIsCycleActive(true);

      // 遮蔽持續約 2 ~ 5 秒 (2000ms ~ 5000ms 隨機)
      const redactDuration = Math.floor(Math.random() * 1000) + 500;

      timerRef.current = setTimeout(() => {
        if (!isMounted) return;

        // 3. 黑色長方形向右退縮，還原完整文字
        setIsCycleActive(false);

        // 不遮蔽狀態持續約 2 ~ 5 秒 (2000ms ~ 5000ms 隨機)
        const cleanDuration = Math.floor(Math.random() * 4000) + 8000;

        timerRef.current = setTimeout(() => {
          if (!isMounted) return;
          setActiveCoveredIds([]);
          // 4. 自動銜接下一輪隨機遮蔽
          runNextCycle();
        }, cleanDuration);
      }, redactDuration);
    };

    return () => {
      isMounted = false;
      clearTimeout(startTimeout);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [trigger]);

  return (
    <span className={`inline-block select-text m-0 p-0 ${className}`}>
      {CHUNKS.map((chunk, index) => {
        const isCovered = isCycleActive && activeCoveredIds.includes(chunk.id);

        return (
          <span
            key={chunk.id}
            className="relative inline-block align-baseline m-0 p-0"
          >
            {/* 標題字元 (帶有開場解碼動效) */}
            <span className="relative z-0 m-0 p-0">
              <ScrambleText
                text={chunk.text}
                trigger={trigger}
                delay={200 + index * 120}
                duration={900}
                periodicGlitch={false}
              />
            </span>

            {/* 純黑長方形審查遮蔽色塊：由左至右展開，由左至右向右側收回 */}
            <motion.span
              className="absolute -inset-y-[4px] -inset-x-[3px] bg-black z-10 pointer-events-none rounded-[1px]"
              style={{
                transformOrigin: isCovered ? "left center" : "right center",
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: isCovered ? 1 : 0 }}
              transition={{
                duration: isCovered ? 0.65 : 0.5,
                ease: isCovered ? [0.16, 1, 0.3, 1] : [0.7, 0, 0.84, 0],
              }}
            />
          </span>
        );
      })}
    </span>
  );
}
