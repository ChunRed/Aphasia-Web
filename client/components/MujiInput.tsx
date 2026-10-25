"use client";

import React, { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsstrikes/react-turnstile";
import ScrambleText from "@/components/ScrambleText";
import RedactedText from "@/components/RedactedText";
import { useSocketTextSender, MessageLog, AnalysisResultPayload } from "@/components/SocketTextSender";

interface MujiInputProps {
  isVisible?: boolean;
  turnstileToken?: string;
}

/**
 * 前端 UI 狀態機（State Machine）
 * - IDLE: 可編輯輸入框，可點擊送出
 * - PENDING: 已送出排隊/分析中，鎖定 UI 嚴禁重複送出
 * - ERROR: 分析失敗，解鎖輸入框與按鈕，保留原內容以供重新送出
 */
export type InputStatus = "IDLE" | "PENDING" | "ERROR";

/**
 * 將使用者輸入的文字根據後端回傳的關鍵字進行切分，
 * 關鍵字保持露出，非關鍵字文字包裝在 RedactedText 黑色長方形色塊中展開。
 */
function renderRedactedInput(rawText: string, keywords: string[], trigger: boolean) {
  if (!rawText) return null;
  if (!keywords || keywords.length === 0) {
    return <span className="text-stone-800">{rawText}</span>;
  }

  const validKeywords = keywords
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter((k) => k.length > 0);

  if (validKeywords.length === 0) {
    return <span className="text-stone-800">{rawText}</span>;
  }

  // 建立比對關鍵字的正規表達式（忽略大小寫）
  const pattern = new RegExp(
    `(${validKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );

  const tokens = rawText.split(pattern);
  let animIndex = 0;

  return tokens.map((token, idx) => {
    if (!token) return null;

    const isKw = validKeywords.some(
      (kw) => kw.toLowerCase() === token.toLowerCase()
    );

    if (isKw) {
      return (
        <span
          key={`kw-${idx}`}
          className="text-stone-900 font-normal m-0 p-0"
        >
          {token}
        </span>
      );
    }

    // 將非關鍵字切分成 6~10 字元的區塊，確保換行時色塊如海報般俐落排列
    const subChunks: string[] = [];
    let remaining = token;
    while (remaining.length > 0) {
      if (remaining.length <= 10) {
        subChunks.push(remaining);
        break;
      }
      const punctMatch = remaining.slice(4, 12).search(/[，,。！？；;\s\n]/);
      const sliceLen = punctMatch !== -1 ? 4 + punctMatch + 1 : 8;
      subChunks.push(remaining.slice(0, sliceLen));
      remaining = remaining.slice(sliceLen);
    }

    return (
      <React.Fragment key={`non-kw-${idx}`}>
        {subChunks.map((sub, sIdx) => {
          const delay = 0.05 + animIndex * 0.08;
          animIndex++;
          return (
            <RedactedText
              key={`sub-${idx}-${sIdx}`}
              trigger={trigger}
              delay={delay}
              duration={0.85}
            >
              {sub}
            </RedactedText>
          );
        })}
      </React.Fragment>
    );
  });
}

export default function MujiInput({
  isVisible = true,
  turnstileToken: propToken = "",
}: MujiInputProps) {
  const {
    submitDiary,
    onDiarySuccess,
    onDiaryError,
    onAnalysisResult,
    serverUrl: socketServerUrl,
  } = useSocketTextSender();

  const [status, setStatus] = useState<InputStatus>("IDLE");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [returnedKeywords, setReturnedKeywords] = useState<string[]>([]);
  const [isRedactingInput, setIsRedactingInput] = useState(false);
  const [redactCountdown, setRedactCountdown] = useState(5);

  const isRedactingRef = useRef(false);
  const redactionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [token, setToken] = useState(propToken);
  const [modal, setModal] = useState<{
    show: boolean;
    isSuccess: boolean;
    message: string;
    targetDeviceId?: number;
  }>({
    show: false,
    isSuccess: false,
    message: "",
    targetDeviceId: undefined,
  });

  useEffect(() => {
    return () => {
      if (redactionTimerRef.current) clearTimeout(redactionTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (propToken) {
      setToken(propToken);
    }
  }, [propToken]);

  const activeToken = propToken || token;

  // 統一啟動 5 秒倒數與文字抹除流程
  const triggerRedactionSequence = (data: {
    keywords?: string[];
    deletedMassText?: string;
    targetDeviceId?: number;
  }) => {
    if (isRedactingRef.current) return;
    isRedactingRef.current = true;

    const kwList = Array.isArray(data?.keywords) ? data.keywords : [];
    const kwFormatted = kwList.join("、");
    const massText = data?.deletedMassText || "0.00 g";
    const targetDeviceId = data?.targetDeviceId != null ? Number(data.targetDeviceId) : undefined;
    const message = kwFormatted
      ? `已完成關鍵字分析：${kwFormatted}\n共計刪除 ${massText} 文字`
      : `已完成關鍵字分析\n共計刪除 ${massText} 文字`;

    // 1. 收到關鍵字，啟動文字抹除動畫（保留關鍵字，遮蔽其餘文字）
    setReturnedKeywords(kwList);
    setIsRedactingInput(true);
    setRedactCountdown(5);
    setStatusMessage("正在抹除無關緊要文字...");

    // 2. 5 秒倒數計時器
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setRedactCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 3. 5 秒倒數完畢後，清空輸入框，彈出分析結果彈窗
    redactionTimerRef.current = setTimeout(() => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setIsRedactingInput(false);
      isRedactingRef.current = false;
      setText("");
      setSubmittedText("");
      setStatus("IDLE");
      setStatusMessage("");

      setModal({
        show: true,
        isSuccess: true,
        message,
        targetDeviceId,
      });
    }, 5000);
  };

  // 監聽來自 Server 的精準定向通知 (ANALYSIS_RESULT、DIARY_SUCCESS 與 DIARY_ERROR)
  useEffect(() => {
    // 監聽 ANALYSIS_RESULT 事件：後端回傳關鍵字與刪除質量
    const unsubscribeAnalysis = onAnalysisResult((data: AnalysisResultPayload) => {
      console.log("[MujiInput] 收到 ANALYSIS_RESULT:", data);
      triggerRedactionSequence(data);
    });

    // 成功通知（備援相容）
    const unsubscribeSuccess = onDiarySuccess((data: MessageLog & { message?: string; targetDeviceId?: number }) => {
      console.log("[MujiInput] 收到 DIARY_SUCCESS:", data);
      triggerRedactionSequence(data);
    });

    // 失敗通知：切換為 ERROR 狀態，解除鎖定，提示「分析失敗，請再次輸入」，保留原輸入文字
    const unsubscribeError = onDiaryError((err: { message: string; code?: string }) => {
      console.warn("[MujiInput] 收到 DIARY_ERROR:", err);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (redactionTimerRef.current) clearTimeout(redactionTimerRef.current);
      setIsRedactingInput(false);
      isRedactingRef.current = false;
      setStatus("ERROR");
      setStatusMessage(err.message || "分析失敗，請再次輸入");
    });

    return () => {
      unsubscribeAnalysis();
      unsubscribeSuccess();
      unsubscribeError();
    };
  }, [onAnalysisResult, onDiarySuccess, onDiaryError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // PENDING 或正在遮蔽時嚴禁重複送出
    if (status === "PENDING" || isRedactingInput) return;

    const length = text.trim().length;

    if (length < 10 || length > 200) {
      setStatus("ERROR");
      setStatusMessage(`字數限制為 10 - 200 字 (目前輸入：${length} 字)`);
      return;
    }

    if (!activeToken) {
      setStatus("ERROR");
      setStatusMessage("未取得有效的安全驗證 token");
      return;
    }

    // 1. 立即記錄送出文字並切換為 PENDING 狀態，鎖定 UI
    setSubmittedText(text.trim());
    setStatus("PENDING");
    setStatusMessage("正在進行關鍵字化...");
    setModal({ show: false, isSuccess: false, message: "", targetDeviceId: undefined });

    try {
      // 2. 先行通過 Cloudflare Turnstile 後端驗證
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.trim(),
          token: activeToken,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatus("ERROR");
        setStatusMessage(data.message || "安全驗證未通過，請重新驗證");
        return;
      }

      // 3. 通過後透過 Socket.IO 發送 SUBMIT_DIARY 事件至伺服器排程佇列
      await submitDiary(text.trim());
      console.log(`[MujiInput] 日記已送至 Server 佇列，等待分析完成 (${socketServerUrl})`);
    } catch (error) {
      console.error("Submit error:", error);
      setStatus("ERROR");
      setStatusMessage("網路連線或伺服器發生錯誤，請稍後重試");
    }
  };

  const isPending = status === "PENDING";
  const isError = status === "ERROR";
  const isValidLength = text.trim().length >= 10 && text.trim().length <= 200;

  return (
    <>

      <div
        className={`w-full max-w-sm mx-auto mt-6 relative z-10 ${isVisible ? "animate-fade-in-delayed" : "opacity-0 pointer-events-none"
          }`}
      >
        <form id="muji-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            {/* Header label */}
            <div className="text-stone-400 text-[11px] tracking-[0.2em] text-left select-none opacity-80 flex items-center justify-between">
              <ScrambleText
                text="請輸入文字（10 - 200 字）"
                trigger={isVisible}
                delay={750}
                duration={1000}
              />
              {(isPending || isRedactingInput) && (
                <span className="text-amber-600 font-mono text-[10px] tracking-wider animate-pulse">
                  {isRedactingInput ? `[文字抹除中 ${redactCountdown}s]` : "[排隊分析中]"}
                </span>
              )}
            </div>

            <div className="relative w-full">
              {/* Textarea: PENDING 時 disabled 鎖定，遮蔽時隱藏由下方視覺層呈現 */}
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (isError) {
                    setStatus("IDLE");
                    setStatusMessage("");
                  }
                }}
                disabled={isPending || isRedactingInput}
                maxLength={250}
                rows={6}
                className={`w-full px-0 py-2 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-stone-800 text-2xl md:text-xl tracking-widest leading-relaxed resize-none transition-all duration-300 font-light ${isRedactingInput
                    ? "opacity-0 pointer-events-none"
                    : isPending
                      ? "opacity-50 cursor-not-allowed select-none"
                      : "opacity-100"
                  }`}
              />

              {/* 關鍵字回傳後的文字遮蔽動畫視覺鏡像層 */}
              {isRedactingInput && (
                <div
                  className="absolute inset-0 px-0 py-2 text-stone-800 text-2xl md:text-xl tracking-widest leading-relaxed font-light text-left overflow-hidden pointer-events-none break-words whitespace-pre-wrap select-none"
                >
                  {renderRedactedInput(submittedText || text, returnedKeywords, true)}
                </div>
              )}

              {/* Custom breathing cursor '|' when empty and idle */}
              {text === "" && !isPending && !isRedactingInput && (
                <div className="absolute top-2 left-0 text-stone-400 select-none pointer-events-none text-2xl md:text-xl font-light animate-cursor-breath">
                  |
                </div>
              )}

              {/* Character indicator & Status Bar */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-200/40">
                {/* 狀態提示文字區域 */}
                <div className="text-left flex-1 pr-2">
                  {isRedactingInput && (
                    <div className="flex items-center gap-2 text-stone-700 text-xs tracking-wider font-mono animate-pulse">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-stone-700 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-stone-900"></span>
                      </span>
                      <span>關鍵字分析完成，正在抹除其餘文字... [{redactCountdown}s]</span>
                    </div>
                  )}

                  {!isRedactingInput && isPending && (
                    <div className="flex items-center gap-2 text-stone-600 text-xs tracking-wider font-mono animate-pulse">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span>正在進行關鍵字化...</span>
                    </div>
                  )}

                  {isError && (
                    <div className="flex flex-col gap-0.5 text-left animate-fade-in">
                      <div className="flex items-center gap-1.5 text-rose-500 text-xs tracking-wide font-medium">
                        <span>{statusMessage || "分析失敗，請再次輸入"}</span>
                      </div>
                      <span className="text-[10px] text-stone-400 font-mono tracking-wider">
                        已保留輸入內容，可直接重新送出
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right text-[10px] text-stone-400 tracking-wider font-mono select-none shrink-0">
                  {text.length} / 200
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Submit Button Container */}
      <div
        className={`fixed bottom-12 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-sm flex flex-col items-center gap-3 z-20 transition-all duration-300 ${isVisible ? "animate-fade-in-delayed" : "opacity-0 pointer-events-none"
          }`}
      >
        {/* Optional fallback turnstile if no token passed */}
        {!activeToken && (
          <div className="flex justify-center w-full min-h-[65px] select-none">
            <Turnstile
              siteKey={
                process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ||
                "1x00000000000000000000AA"
              }
              options={{ theme: "dark" }}
              onSuccess={(t) => setToken(t)}
              onExpire={() => setToken("")}
              onError={() => setToken("")}
            />
          </div>
        )}

        {/* Submit Button: PENDING 或正在遮蔽時 disabled 鎖定 */}
        <button
          type="submit"
          form="muji-form"
          disabled={!activeToken || isPending || isRedactingInput || !isValidLength}
          className={`w-full py-3 font-light tracking-[0.3em] text-xs transition-all duration-300 focus:outline-none ${!activeToken || isPending || isRedactingInput || !isValidLength
              ? "bg-stone-300 text-stone-500 opacity-60 cursor-not-allowed"
              : isError
                ? "bg-stone-900 text-amber-200 hover:bg-stone-800 cursor-pointer shadow-md"
                : "bg-stone-800 text-stone-100 hover:bg-stone-700 cursor-pointer shadow-md"
            }`}
        >
          {isRedactingInput ? (
            <div className="flex items-center justify-center gap-2.5 text-stone-500 font-mono tracking-[0.25em] text-xs">
              <span>冗餘文字抹除中 [{redactCountdown}s]</span>
            </div>
          ) : isPending ? (
            <div className="flex items-center justify-center gap-2.5 text-stone-600 font-mono tracking-[0.25em] text-xs">
              <svg
                className="animate-spin h-3.5 w-3.5 text-stone-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                ></path>
              </svg>
              <span>正在進行關鍵字化...</span>
            </div>
          ) : isError ? (
            <span className="text-amber-100 tracking-[0.3em] font-medium">
              重新送出 / RETRY
            </span>
          ) : (
            <ScrambleText
              text="送出 / SUBMIT"
              trigger={isVisible}
              delay={850}
              duration={900}
            />
          )}
        </button>
      </div>

      {/* Muji Style Modal Overlay (成功完成反饋彈窗 - 遮蔽完 5 秒後顯示) */}
      {modal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none">
          <div className="bg-[#fafaf9] border border-stone-200 p-6 sm:p-8 max-w-md w-full text-center relative shadow-lg animate-fade-in">
            {/* Minimal Icon Indicator */}
            <div className="mb-4">
              {modal.isSuccess ? (
                <span className="text-stone-500 text-4xl font-extralight">○</span>
              ) : (
                <span className="text-stone-400 text-4xl font-extralight">✕</span>
              )}
            </div>

            {/* Message */}
            <div className="text-stone-700 text-xs sm:text-sm font-extralight tracking-widest leading-loose whitespace-pre-line mb-6">
              {modal.message}
            </div>

            {/* 6 裝置空間指示圖示 (由左至右為裝置 6、5、4、3、2、1，最右側為裝置 1，最左側為裝置 6) */}
            {modal.isSuccess && (
              <div className="mb-6 w-full">
                <div className="text-[10px] text-stone-400 tracking-[0.25em] font-mono mb-3">
                  連動展場裝置
                </div>
                <div
                  className="grid grid-cols-6 gap-1.5 sm:gap-2 items-end justify-center w-full"
                  aria-label="Device Allocation Spatial Indicator"
                >
                  {[6, 5, 4, 3, 2, 1].map((deviceId) => {
                    const isTarget = modal.targetDeviceId === deviceId;
                    return (
                      <div
                        key={deviceId}
                        className={`flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-[2px] transition-all duration-300 ${isTarget
                          ? "border border-stone-900 shadow-sm animate-device-breath"
                          : "border border-transparent"
                        }`}
                      >
                        {/* 實體裝置圖示 (installation-icon) */}
                        <div className="w-full flex items-center justify-center min-h-[28px] sm:min-h-[32px]">
                          <img
                            src="/installation-icon.png"
                            alt={`裝置 ${deviceId}`}
                            className="w-full max-w-[42px] h-auto object-contain opacity-100"
                          />
                        </div>

                        {/* 裝置編號標示 */}
                        <span className="text-[9px] sm:text-[10px] tracking-wider mt-1.5 whitespace-nowrap font-mono text-stone-900 font-normal">
                          裝置 {deviceId}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setModal({ ...modal, show: false })}
              className="px-6 py-2 border border-stone-200 hover:border-stone-400 text-stone-500 hover:text-stone-800 text-xs tracking-widest transition-colors duration-300 focus:outline-none cursor-pointer"
            >
              確認 / OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
