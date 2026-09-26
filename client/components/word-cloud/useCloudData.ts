"use client";

import { useState, useEffect, useCallback } from "react";
import type { WordItem } from "./types";

interface UseCloudDataOptions {
  url?: string;
  minSize?: number;
  maxSize?: number;
}

interface UseCloudDataReturn {
  words: WordItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setCustomWords: (words: WordItem[]) => void;
}

/**
 * Custom Hook: Fetches public/cloud-text.txt and parses lines into weighted word data.
 */
export function useCloudData(options: UseCloudDataOptions = {}): UseCloudDataReturn {
  const { url = "/cloud-text.txt", minSize = 14, maxSize = 88 } = options;
  const [words, setWords] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} when loading ${url}`);
      }
      const rawText = await response.text();

      // Split lines and parse non-empty entries
      const lines = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Assign visual weights/sizes with poster-style hierarchy suitable for Chinese & Numbers
      const parsedWords: WordItem[] = lines.map((line, index) => {
        let size = 24;

        // Numbered tags (e.g. "1.", "23.", "60.", "104.")
        if (/^\d+\.?$/.test(line)) {
          size = 64 + (index % 4) * 10; // Large numbers 64px - 94px
        } else if (line.length <= 4) {
          // Short Chinese phrases (1-4 characters, e.g. "失語症", "隱含空間")
          size = 36 + (line.length % 3) * 6; // 36px - 48px
        } else if (line.length <= 8) {
          // Medium Chinese phrases (5-8 characters, e.g. "湧現反饋迴路")
          size = 24 + (line.length % 3) * 4; // 24px - 32px
        } else {
          // Longer Chinese sentences (e.g. "模型無法記起賦予它生命的提示詞")
          size = 15 + (line.length % 3) * 2; // 15px - 19px
        }

        // Clamp size range
        size = Math.max(minSize, Math.min(maxSize, size));

        return {
          text: line,
          size,
        };
      });

      setWords(parsedWords);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load cloud text data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [url, minSize, maxSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    words,
    loading,
    error,
    refetch: fetchData,
    setCustomWords: setWords,
  };
}
