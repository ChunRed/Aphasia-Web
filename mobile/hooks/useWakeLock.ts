"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UseWakeLockResult {
  /** 瀏覽器是否支援 Screen Wake Lock API */
  isSupported: boolean;
  /** 當前螢幕常亮鎖定是否處於啟用狀態 */
  isLocked: boolean;
  /** 手動請求開啟常亮鎖定 */
  request: () => Promise<boolean>;
  /** 手動釋放常亮鎖定 */
  release: () => Promise<void>;
}

/**
 * Custom Hook: useWakeLock
 * 防止行動裝置（iOS 16.4+ 與 Android Chrome/Edge 等）在展覽與互動期間螢幕自動熄滅
 * 具備：
 * 1. 頁面加載自動啟用
 * 2. 分頁切換/返回（visibilitychange）自動重新獲取鎖定
 * 3. 首次手勢點擊（User Interaction）防禦性補償
 * 4. 元件卸載時安全釋放
 */
export function useWakeLock(): UseWakeLockResult {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const sentinelRef = useRef<any>(null);

  const request = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) {
      return false;
    }

    // 當前分頁必須處於可見狀態才可申請
    if (document.visibilityState !== "visible") {
      return false;
    }

    try {
      // 若已持有鎖定且尚未被釋放，直接視為已鎖定
      if (sentinelRef.current && !sentinelRef.current.released) {
        setIsLocked(true);
        return true;
      }

      const sentinel = await (navigator as any).wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setIsLocked(true);
      console.log("[WakeLock] 螢幕常亮已成功鎖定 (Screen wake lock active)");

      sentinel.addEventListener("release", () => {
        console.log("[WakeLock] 螢幕常亮鎖定已釋放 (Screen wake lock released)");
        sentinelRef.current = null;
        setIsLocked(false);
      });

      return true;
    } catch (err: any) {
      console.warn(
        "[WakeLock] 申請螢幕常亮失敗 (可能需要使用者點擊互動或處於省電模式):",
        err?.message || err
      );
      setIsLocked(false);
      return false;
    }
  }, []);

  const release = useCallback(async (): Promise<void> => {
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch (err) {
        console.warn("[WakeLock] 釋放鎖定時發生錯誤:", err);
      }
      sentinelRef.current = null;
      setIsLocked(false);
    }
  }, []);

  useEffect(() => {
    const supported = typeof window !== "undefined" && "wakeLock" in navigator;
    setIsSupported(supported);

    if (!supported) {
      console.log("[WakeLock] 當前瀏覽器環境不支援 Screen Wake Lock API");
      return;
    }

    // 1. 初次載入自動嘗試請求鎖定
    request();

    // 2. 監聽分頁切換 / 螢幕解鎖喚醒 (Visibility Change)
    // iOS 與 Android 會在分頁進入背景時自動釋放 wakeLock，因此返回時需重新請求
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        request();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 3. 使用者手勢補償 (User Interaction Fallback)
    // 部分行動瀏覽器若阻擋無手勢的自動 request，在使用者第一次觸摸/點擊螢幕時補申請
    const handleUserInteraction = () => {
      if (!sentinelRef.current || sentinelRef.current.released) {
        request();
      }
    };
    window.addEventListener("pointerdown", handleUserInteraction, { passive: true });
    window.addEventListener("touchstart", handleUserInteraction, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", handleUserInteraction);
      window.removeEventListener("touchstart", handleUserInteraction);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [request]);

  return { isSupported, isLocked, request, release };
}

export default useWakeLock;
