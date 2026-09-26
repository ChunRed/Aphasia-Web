"use client";

import React from "react";
import { WordCloud } from "./WordCloud";
import { useWordCloudContext } from "./WordCloudContext";

interface BackgroundWordCloudProps {
  className?: string;
  visible?: boolean;
}

export const BackgroundWordCloud: React.FC<BackgroundWordCloudProps> = ({
  className = "",
  visible = true,
}) => {
  const { words, loading, error, fontFamily, layoutKey, opacity } = useWordCloudContext();

  // If not visible or data is loading/error, do not mount WordCloud into DOM.
  // This ensures that when visible becomes true, WordCloud mounts fresh and triggers
  // each individual word's framer-motion stagger fade-in animation sequentially.
  if (!visible || loading || error || !words.length) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <WordCloud
        key={`bg-cloud-${layoutKey}-${fontFamily}`}
        words={words}
        width={1100}
        height={750}
        fontFamily={fontFamily}
        className="w-full h-full max-w-6xl max-h-screen"
      />
    </div>
  );
};
