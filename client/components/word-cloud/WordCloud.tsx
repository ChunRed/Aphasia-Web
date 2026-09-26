"use client";

import React, { useEffect, useState, useId } from "react";
import cloud from "d3-cloud";
import { motion, AnimatePresence } from "framer-motion";
import type { WordCloudProps, PlacedWord } from "./types";

export const WordCloud: React.FC<WordCloudProps> = ({
  words,
  width = 960,
  height = 650,
  fontFamily = "sans-serif",
  className = "",
}) => {
  const [placedWords, setPlacedWords] = useState<PlacedWord[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const instanceId = useId();

  // Helper to determine font weight per word size (ensures measurement alignment in d3-cloud)
  const getWordWeight = (size: number): number => {
    if (size >= 60) return 800;
    if (size >= 36) return 600;
    if (size >= 24) return 400;
    return 300;
  };

  // Helper to determine styling (fill color, font weight, letter spacing) for light mode poster aesthetic
  const getWordStyle = (size: number) => {
    if (size >= 60) {
      return {
        fill: "rgba(0, 0, 0, 0.95)",
        fontWeight: 800,
        letterSpacing: "0.02em",
      };
    } else if (size >= 36) {
      return {
        fill: "rgba(0, 0, 0, 0.78)",
        fontWeight: 600,
        letterSpacing: "0.01em",
      };
    } else if (size >= 24) {
      return {
        fill: "rgba(0, 0, 0, 0.58)",
        fontWeight: 400,
        letterSpacing: "0em",
      };
    } else {
      return {
        fill: "rgba(0, 0, 0, 0.38)",
        fontWeight: 300,
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

    // Configure d3-cloud layout with generous padding to prevent text collision/overlapping
    const layout = cloud<cloud.Word>()
      .size([width, height])
      .words(
        words.map((w) => ({
          text: w.text,
          size: w.size,
        }))
      )
      // Generous padding (12px) to prevent bounding box overlaps
      .padding(12)
      // Restrict rotation strictly to 0° or 90° for vertical/horizontal mixed layout
      .rotate((_, index) => (index % 3 === 0 ? 90 : 0))
      .font(fontFamily)
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
  }, [words, width, height, fontFamily]);

  return (
    <div className={`relative flex items-center justify-center w-full overflow-hidden ${className}`}>
      {/* SVG Canvas with centered viewBox (-width/2, -height/2, width, height) */}
      <svg
        width="100%"
        height="100%"
        viewBox={`-${width / 2} -${height / 2} ${width} ${height}`}
        className="w-full h-auto max-h-[80vh] select-none overflow-visible"
        aria-label="Word Cloud Canvas"
      >
        <AnimatePresence mode="wait">
          {!isCalculating && (
            <g key={`cloud-group-${words.length}`}>
              {placedWords.map((word, idx) => {
                const style = getWordStyle(word.size);
                // Stagger delay based on index for progressive entrance
                const delay = (idx % 15) * 0.04 + (idx / placedWords.length) * 0.15;

                return (
                  <motion.g
                    key={`${instanceId}-${word.text}-${idx}`}
                    initial={{
                      opacity: 0,
                      scale: 0.4,
                      x: word.x,
                      y: word.y,
                      rotate: word.rotate,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      x: word.x,
                      y: word.y,
                      rotate: word.rotate,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.2,
                      transition: { duration: 0.2 },
                    }}
                    transition={{
                      duration: 0.6,
                      delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    whileHover={{
                      scale: 1.15,
                      transition: { duration: 0.2 },
                    }}
                    className="cursor-pointer group"
                  >
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fontFamily,
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
