"use client";

import { useEffect } from "react";
import { isValidDeviceId } from "@/config/seedPresets";

/**
 * Custom Hook: useDynamicManifest
 * 在前端動態抽換 Web App Manifest 的 start_url 與裝置專屬標題：
 * 1. 當使用者以網址 /?deviceId=3（或 1~6）開啟時：
 *    - 將 <link rel="manifest"> 的 href 動態抽換為 /manifest.webmanifest?deviceId=3
 *    - 同時在 DOM 生成包含當前 start_url 的 Blob Manifest，確保 iPhone Safari 加入主畫面時正確鎖定帶參網址
 *    - 自動儲存 deviceId 至 localStorage 作為斷線/重載備案
 *    - 同步更新 <meta name="apple-mobile-web-app-title"> 為 "Aphasia 3"
 */
export function useDynamicManifest(explicitDeviceId?: string | null) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const params = new URLSearchParams(window.location.search);
      const rawId =
        explicitDeviceId ||
        params.get("deviceId") ||
        params.get("device_id") ||
        params.get("id") ||
        localStorage.getItem("aphasia_deviceId");

      if (!rawId) return;

      const trimmedId = rawId.trim();
      if (!isValidDeviceId(trimmedId)) return;

      // 1. 同步儲存到 localStorage，確保未來無論何種方式重新開啟都能保留該裝置號
      try {
        localStorage.setItem("aphasia_deviceId", trimmedId);
      } catch {}

      const startUrl = `/?deviceId=${encodeURIComponent(trimmedId)}`;
      const manifestUrl = `/manifest.webmanifest?deviceId=${encodeURIComponent(trimmedId)}`;
      const appName = `Aphasia [DEV ${trimmedId}]`;
      const shortName = `Aphasia ${trimmedId}`;

      // 2. 動態抽換或建立 <link rel="manifest">
      let manifestLink = document.querySelector<HTMLLinkElement>(
        'link[rel="manifest"]'
      );
      if (!manifestLink) {
        manifestLink = document.createElement("link");
        manifestLink.rel = "manifest";
        document.head.appendChild(manifestLink);
      }
      manifestLink.href = manifestUrl;

      // 3. 更新 iOS 專屬 Web App 標題中繼標籤
      let appleTitleMeta = document.querySelector<HTMLMetaElement>(
        'meta[name="apple-mobile-web-app-title"]'
      );
      if (!appleTitleMeta) {
        appleTitleMeta = document.createElement("meta");
        appleTitleMeta.name = "apple-mobile-web-app-title";
        document.head.appendChild(appleTitleMeta);
      }
      appleTitleMeta.content = shortName;

      // 4. 同步更新網頁標題
      document.title = appName;

      console.log(
        `[DynamicManifest] 已成功動態抽換 Manifest start_url -> "${startUrl}", title -> "${shortName}"`
      );
    } catch (err) {
      console.warn("[DynamicManifest] 動態抽換 Manifest 失敗:", err);
    }
  }, [explicitDeviceId]);
}

export default useDynamicManifest;
