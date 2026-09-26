"use client";

import React, { useEffect, useState, useId } from "react";
import cloud from "d3-cloud";
import { motion, AnimatePresence } from "framer-motion";
import type { WordCloudProps, PlacedWord } from "./types";

export const WordCloud: React.FC<WordCloudProps> = ({
  words,
  width = 960,
  height = 650,
  fontFamily = "serif",
  className = "",
}) => {
  const [placedWords, setPlacedWords] = useState<PlacedWord[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const instanceId = useId();

  // Font family resolution for CSS styling and canvas measurement
  const resolvedFontFamily = React.useMemo(() => {
    if (fontFamily === "serif") {
      return '"Noto Serif TC", "Songti TC", "PMingLiU", "Times New Roman", serif';
    }
    if (fontFamily === "monospace") {
      return '"Geist Mono", monospace, sans-serif';
    }
    return '"Geist Sans", sans-serif';
  }, [fontFamily]);

  // Helper to determine font weight per word size (ensures measurement alignment in d3-cloud)
  const getWordWeight = (size: number): number => {
    if (size >= 40) return 700;
    if (size >= 28) return 500;
    return 400;
  };

  // Helper to determine styling (fill color, font weight, letter spacing) for light mode poster aesthetic
  const getWordStyle = (size: number) => {
    if (size >= 40) {
      return {
        fill: "rgba(0, 0, 0, 0.92)",
        fontWeight: 700,
        letterSpacing: "0.02em",
      };
    } else if (size >= 28) {
      return {
        fill: "rgba(0, 0, 0, 0.72)",
        fontWeight: 500,
        letterSpacing: "0.01em",
      };
    } else {
      return {
        fill: "rgba(0, 0, 0, 0.45)",
        fontWeight: 400,
        letterSpacing: "0em",
      };
    }
  };

  useEffect(() => {
    if (!words || words.length === 0) {
      setPlacedWords([]);
      return;
    }

    setIsCalculating(true);

    // Configure d3-cloud layout with tight padding (4px) for dense word packing
    const layout = cloud<cloud.Word>()
      .size([width, height])
      .words(
        words.map((w) => ({
          text: w.text,
          size: w.size,
        }))
      )
      // Tight padding (4px) to ensure words sit close together ("密一點")
      .padding(4)
      // Restrict rotation strictly to 0° or 90° for vertical/horizontal mixed layout
      .rotate((_, index) => (index % 3 === 0 ? 90 : 0))
      .font(resolvedFontFamily)
      .fontSize((d) => d.size || 16)
      .fontWeight((d) => getWordWeight(d.size || 16))
      .spiral("archimedean")
      .on("end", (computedWords) => {
        setPlacedWords(computedWords as PlacedWord[]);
        setIsCalculating(false);
      });

    layout.start();

    return () => {
      layout.stop();
    };
  }, [words, width, height, resolvedFontFamily]);

  return (
    <div className={`relative flex items-center justify-center w-full h-full overflow-hidden ${className}`}>
      {/* SVG Canvas expanding 100% full screen */}
      <svg
        width="100%"
        height="100%"
        viewBox={`-${width / 2} -${height / 2} ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full select-none overflow-visible"
        aria-label="Word Cloud Canvas"
      >
        <AnimatePresence mode="wait">
          {!isCalculating && (
            <g key={`cloud-group-${words.length}`}>
              {placedWords.map((word, idx) => {
                const style = getWordStyle(word.size);
                // Stagger delay per word
                const delay = 0.1 + idx * 0.045;

                // Timeline: 0.6s Fade-in -> 5.0s Hold -> 1.2s Fade-out (Total 6.8s per word)
                const fadeInRatio = 0.6 / 6.8;
                const holdRatio = 5.6 / 6.8;

                return (
                  <motion.g
                    key={`${instanceId}-${word.text}-${idx}`}
                    initial={{
                      opacity: 0,
                      scale: 0.3,
                      x: word.x,
                      y: word.y,
                      rotate: word.rotate,
                    }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      scale: [0.3, 1, 1, 0.4],
                      x: word.x,
                      y: word.y,
                      rotate: word.rotate,
                    }}
                    transition={{
                      duration: 6.8,
                      delay,
                      times: [0, fadeInRatio, holdRatio, 1],
                      ease: "easeInOut",
                    }}
                    className="cursor-pointer group"
                  >
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fontFamily: resolvedFontFamily,
                        fontSize: `${word.size}px`,
                        fontWeight: style.fontWeight,
                        letterSpacing: style.letterSpacing,
                        fill: style.fill,
                      }}
                      className="transition-colors duration-200 group-hover:fill-black"
                    >
                      {word.text}
                    </text>
                  </motion.g>
                );
              })}
            </g>
          )}
        </AnimatePresence>
      </svg>
    </div>
  );
};
