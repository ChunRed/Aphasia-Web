"use client";

import React from "react";
import Link from "next/link";
import { WordCloud, useWordCloudContext } from "@/components/word-cloud";

export default function CloudTestPage() {
  const {
    words,
    loading,
    error,
    refetch,
    fontFamily,
    setFontFamily,
    layoutKey,
    reLayout,
    opacity,
    setOpacity,
  } = useWordCloudContext();

  return (
    <main className="relative min-h-screen w-full bg-white text-black selection:bg-black selection:text-white flex flex-col justify-between p-6 md:p-12 overflow-hidden font-sans">
      {/* Background Decorative Grid & Ambient Light Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-100/80 via-white to-white pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-60 pointer-events-none" />

      {/* Header Bar */}
      <header className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-black/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-neutral-500 hover:text-black transition-colors flex items-center gap-1 border border-black/10 px-2.5 py-1 rounded bg-neutral-50 hover:bg-neutral-100"
            >
              &larr; 返回主頁
            </Link>
            <span className="inline-block w-2.5 h-2.5 bg-black rounded-full animate-pulse" />
            <h1 className="text-xl md:text-2xl font-extrabold tracking-widest uppercase text-black">
              失語症 // 文字雲設定與測試
            </h1>
          </div>
          <p className="text-xs text-neutral-500 mt-1.5 font-mono">
            此頁面的字體、重新排版與背景透明度設定會<b>同步套用至主畫面背景</b>
          </p>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          {/* Font Family Selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider">字型選擇</span>
            <div className="flex bg-neutral-100 border border-black/10 rounded-md p-1">
              <button
                onClick={() => setFontFamily("sans-serif")}
                className={`px-3 py-1 rounded transition-colors ${
                  fontFamily === "sans-serif"
                    ? "bg-black text-white font-semibold"
                    : "text-neutral-600 hover:text-black"
                }`}
              >
                黑體 Sans
              </button>
              <button
                onClick={() => setFontFamily("serif")}
                className={`px-3 py-1 rounded transition-colors ${
                  fontFamily === "serif"
                    ? "bg-black text-white font-semibold"
                    : "text-neutral-600 hover:text-black"
                }`}
              >
                明體 Serif
              </button>
              <button
                onClick={() => setFontFamily("monospace")}
                className={`px-3 py-1 rounded transition-colors ${
                  fontFamily === "monospace"
                    ? "bg-black text-white font-semibold"
                    : "text-neutral-600 hover:text-black"
                }`}
              >
                等寬 Mono
              </button>
            </div>
          </div>

          {/* Opacity Control */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
              主頁背景透明度 ({Math.round(opacity * 100)}%)
            </span>
            <div className="flex items-center gap-2 bg-neutral-100 border border-black/10 rounded-md px-3 py-1.5 h-[34px]">
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-24 accent-black cursor-pointer"
              />
            </div>
          </div>

          {/* Re-layout Button */}
          <div className="flex flex-col justify-end">
            <button
              onClick={reLayout}
              className="px-4 py-2 bg-neutral-900 hover:bg-black text-white rounded-md border border-black/10 transition-all hover:shadow-md active:scale-95 h-[34px] flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
              </svg>
              同步重新排版
            </button>
          </div>
        </div>
      </header>

      {/* Center Word Cloud Preview Stage */}
      <section className="relative z-10 flex-1 flex items-center justify-center py-8">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-neutral-500 text-sm font-mono">
            <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            <span>計算 d3-cloud 排版中...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center font-mono">
            <p className="font-semibold text-sm">載入資料失敗</p>
            <p className="text-xs text-red-500 mt-1">{error}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded transition-colors"
            >
              重試
            </button>
          </div>
        ) : (
          <WordCloud
            key={`${layoutKey}-${fontFamily}`}
            words={words}
            width={960}
            height={650}
            fontFamily={fontFamily}
            className="max-w-5xl"
          />
        )}
      </section>

      {/* Footer Details */}
      <footer className="relative z-10 flex flex-col sm:flex-row items-center justify-between border-t border-black/10 pt-4 text-[11px] text-neutral-500 gap-2 font-mono">
        <div className="flex items-center gap-4">
          <span>路徑: /public/cloud-text.txt</span>
          <span>&bull;</span>
          <span>詞彙數量: {words.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="underline hover:text-black">
            前往主畫面驗證背景效果 &rarr;
          </Link>
        </div>
      </footer>
    </main>
  );
}
