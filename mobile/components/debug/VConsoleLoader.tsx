"use client";

import { useEffect } from "react";

/**
 * VConsoleLoader:
 * 在行動端（iPhone / Android）直接顯示 vConsole 浮動除錯面板
 * 支援查看 console.log、網路封包 (Network)、系統資訊 (System) 與儲存 (Storage)
 */
export default function VConsoleLoader() {
  useEffect(() => {
    // 確保只在瀏覽器端動態載入，防止 SSR 階段出錯
    if (typeof window === "undefined") return;

    let vconsoleInstance: any = null;

    import("vconsole")
      .then(({ default: VConsole }) => {
        // 防止重複實例化
        if (!(window as any).__vconsole) {
          vconsoleInstance = new VConsole({
            theme: "dark",
          });
          (window as any).__vconsole = vconsoleInstance;
          console.log("[vConsole] Mobile DevTools 啟動成功，可點擊右下角綠色按鈕展開 Log");
        }
      })
      .catch((err) => {
        console.warn("[vConsole] 載入失敗:", err);
      });

    return () => {
      if (vconsoleInstance) {
        vconsoleInstance.destroy();
        delete (window as any).__vconsole;
      }
    };
  }, []);

  return null;
}
