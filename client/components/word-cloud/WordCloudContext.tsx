"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useCloudData } from "./useCloudData";
import type { WordItem } from "./types";

interface WordCloudContextType {
  fontFamily: string;
  layoutKey: number;
  opacity: number;
  words: WordItem[];
  loading: boolean;
  error: string | null;
  setFontFamily: (font: string) => void;
  setOpacity: (opacity: number) => void;
  reLayout: () => void;
  refetch: () => Promise<void>;
}

const STORAGE_KEY_FONT = "aphasia_cloud_font_family";
const STORAGE_KEY_LAYOUT = "aphasia_cloud_layout_key";
const STORAGE_KEY_OPACITY = "aphasia_cloud_opacity";

const WordCloudContext = createContext<WordCloudContextType | undefined>(undefined);

export const WordCloudProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { words, loading, error, refetch } = useCloudData({
    url: "/cloud-text.txt",
    minSize: 14,
    maxSize: 88,
  });

  const [fontFamily, setFontFamilyState] = useState<string>("sans-serif");
  const [layoutKey, setLayoutKeyState] = useState<number>(0);
  const [opacity, setOpacityState] = useState<number>(0.35);

  // Load persisted settings on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFont = localStorage.getItem(STORAGE_KEY_FONT);
      if (savedFont) setFontFamilyState(savedFont);

      const savedLayoutKey = localStorage.getItem(STORAGE_KEY_LAYOUT);
      if (savedLayoutKey) setLayoutKeyState(parseInt(savedLayoutKey, 10) || 0);

      const savedOpacity = localStorage.getItem(STORAGE_KEY_OPACITY);
      if (savedOpacity) setOpacityState(parseFloat(savedOpacity) || 0.35);
    }
  }, []);

  // Listen for storage events across browser tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_FONT && e.newValue) {
        setFontFamilyState(e.newValue);
      }
      if (e.key === STORAGE_KEY_LAYOUT && e.newValue) {
        setLayoutKeyState(parseInt(e.newValue, 10) || 0);
      }
      if (e.key === STORAGE_KEY_OPACITY && e.newValue) {
        setOpacityState(parseFloat(e.newValue) || 0.35);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setFontFamily = useCallback((font: string) => {
    setFontFamilyState(font);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_FONT, font);
    }
  }, []);

  const setOpacity = useCallback((op: number) => {
    setOpacityState(op);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_OPACITY, op.toString());
    }
  }, []);

  const reLayout = useCallback(() => {
    setLayoutKeyState((prev) => {
      const next = prev + 1;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY_LAYOUT, next.toString());
      }
      return next;
    });
  }, []);

  return (
    <WordCloudContext.Provider
      value={{
        fontFamily,
        layoutKey,
        opacity,
        words,
        loading,
        error,
        setFontFamily,
        setOpacity,
        reLayout,
        refetch,
      }}
    >
      {children}
    </WordCloudContext.Provider>
  );
};

export function useWordCloudContext() {
  const context = useContext(WordCloudContext);
  if (!context) {
    throw new Error("useWordCloudContext must be used within a WordCloudProvider");
  }
  return context;
}
