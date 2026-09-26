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
  const { url = "/cloud-text.txt", minSize = 16, maxSize = 48 } = options;
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

      // Assign visual weights/sizes suited for dense layout with many words
      const parsedWords: WordItem[] = lines.map((line, index) => {
        let size = 24;

        if (line.length <= 3) {
          // Short 2-3 character phrases
          size = 34 + (index % 4) * 3; // 34px - 43px
        } else if (line.length <= 6) {
          // Medium 4-6 character phrases
          size = 24 + (index % 4) * 2; // 24px - 30px
        } else {
          // Longer phrases & sentences
          size = 18 + (index % 3) * 2; // 18px - 22px
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
