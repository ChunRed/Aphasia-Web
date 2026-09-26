"use client";

import React, { useState, useEffect } from "react";
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
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 700,
    height: 1200,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Dynamically adapt layout canvas aspect ratio based on device orientation
      if (w < 768) {
        // Mobile portrait canvas (700 x 1200) ensures words spread from top to bottom on phone screens
        setDimensions({ width: 700, height: 1250 });
      } else {
        // Desktop landscape canvas (1200 x 800)
        setDimensions({ width: 1250, height: 800 });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  if (!visible || loading || error || !words.length) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <WordCloud
        key={`bg-cloud-${layoutKey}-${fontFamily}-${dimensions.width}x${dimensions.height}`}
        words={words}
        width={dimensions.width}
        height={dimensions.height}
        fontFamily={fontFamily}
        className="w-full h-full"
      />
    </div>
  );
};
