"use client";

import { useState, useEffect } from "react";
import { Turnstile } from "@marsstrikes/react-turnstile";
import ScrambleText from "@/components/ScrambleText";
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
  const [token, setToken] = useState(propToken);
  const [modal, setModal] = useState<{
    show: boolean;
    isSuccess: boolean;
    message: string;
  }>({
    show: false,
    isSuccess: false,
    message: "",
  });

  useEffect(() => {
    if (propToken) {
      setToken(propToken);
    }
  }, [propToken]);

  const activeToken = propToken || token;

  // 監聽來自 Server 的精準定向通知 (ANALYSIS_RESULT、DIARY_SUCCESS 與 DIARY_ERROR)
  useEffect(() => {
    // 監聽 ANALYSIS_RESULT 事件：顯示篩選出的關鍵字與被刪除微觀質量克數
    const unsubscribeAnalysis = onAnalysisResult((data: AnalysisResultPayload) => {
      console.log("[MujiInput] 收到 ANALYSIS_RESULT:", data);
      setText("");
      setStatus("IDLE");
      setStatusMessage("");

      const kwList = Array.isArray(data?.keywords) ? data.keywords : [];
      const kwFormatted = kwList.join("、");
      const massText = data?.deletedMassText || "0.00 g";
      const message = kwFormatted
        ? `已完成關鍵字分析：${kwFormatted}，共計刪除 ${massText} 文字`
        : `已完成關鍵字分析，共計刪除 ${massText} 文字`;

      setModal({
        show: true,
        isSuccess: true,
        message,
      });
    });

    // 成功通知（備援相容）：清空輸入框，顯示完成反饋，重置為 IDLE 狀態
    const unsubscribeSuccess = onDiarySuccess((data: MessageLog & { message?: string }) => {
      console.log("[MujiInput] 收到 DIARY_SUCCESS:", data);
      setText("");
      setStatus("IDLE");
      setStatusMessage("");

      setModal((prev) => {
        // 若已收到 ANALYSIS_RESULT 並顯示詳細文案，則保留
        if (prev.show && prev.message.startsWith("已完成關鍵字分析")) {
          return prev;
        }

        const kwList = Array.isArray(data?.keywords) ? data.keywords : [];
        const kwFormatted = kwList.join("、");
        const massText = data?.deletedMassText;
        const message = (kwFormatted && massText)
          ? `已完成關鍵字分析：${kwFormatted}，共計刪除 ${massText} 文字`
          : (kwFormatted ? `已完成關鍵字分析：${kwFormatted}` : "已完成關鍵字分析");

        return {
          show: true,
          isSuccess: true,
          message,
        };
      });
    });

    // 失敗通知：切換為 ERROR 狀態，解除鎖定，提示「分析失敗，請再次輸入」，保留原輸入文字！
    const unsubscribeError = onDiaryError((err: { message: string; code?: string }) => {
      console.warn("[MujiInput] 收到 DIARY_ERROR:", err);
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

    // PENDING 狀態嚴禁重複送出
    if (status === "PENDING") return;

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

    // 1. 立即切換為 PENDING 狀態，鎖定 UI，顯示「正在進行關鍵字化...」
    setStatus("PENDING");
    setStatusMessage("正在進行關鍵字化...");
    setModal({ show: false, isSuccess: false, message: "" });

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
      // 保持 PENDING 狀態，等待 Server 經由 Socket 回傳 DIARY_SUCCESS 或 DIARY_ERROR
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
        className={`w-full max-w-sm mx-auto mt-6 ${
          isVisible ? "animate-fade-in-delayed" : "opacity-0 pointer-events-none"
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
              {isPending && (
                <span className="text-amber-600 font-mono text-[10px] tracking-wider animate-pulse">
                  [排隊分析中]
                </span>
              )}
            </div>

            <div className="relative w-full">
              {/* Textarea: PENDING 時 disabled 鎖定 */}
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (isError) {
                    setStatus("IDLE");
                    setStatusMessage("");
                  }
                }}
                disabled={isPending}
                maxLength={250}
                rows={6}
                className={`w-full px-0 py-2 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-stone-800 text-2xl md:text-xl tracking-widest leading-relaxed resize-none transition-all duration-300 font-light ${
                  isPending
                    ? "opacity-50 cursor-not-allowed select-none"
                    : "opacity-100"
                }`}
              />

              {/* Custom breathing cursor '|' when empty and idle */}
              {text === "" && !isPending && (
                <div className="absolute top-2 left-0 text-stone-400 select-none pointer-events-none text-2xl md:text-xl font-light animate-cursor-breath">
                  |
                </div>
              )}

              {/* Character indicator & Status Bar */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-200/40">
                {/* 狀態提示文字區域 */}
                <div className="text-left flex-1 pr-2">
                  {isPending && (
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
        className={`fixed bottom-12 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-sm flex flex-col items-center gap-3 z-20 transition-all duration-300 ${
          isVisible ? "animate-fade-in-delayed" : "opacity-0 pointer-events-none"
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

        {/* Submit Button: PENDING 時 disabled 鎖定 */}
        <button
          type="submit"
          form="muji-form"
          disabled={!activeToken || isPending || !isValidLength}
          className={`w-full py-3 font-light tracking-[0.3em] text-xs transition-all duration-300 focus:outline-none ${
            !activeToken || isPending || !isValidLength
              ? "bg-stone-300 text-stone-500 opacity-60 cursor-not-allowed"
              : isError
              ? "bg-stone-900 text-amber-200 hover:bg-stone-800 cursor-pointer shadow-md"
              : "bg-stone-800 text-stone-100 hover:bg-stone-700 cursor-pointer shadow-md"
          }`}
        >
          {isPending ? (
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

      {/* Muji Style Modal Overlay (成功完成反饋彈窗) */}
      {modal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none">
          <div className="bg-[#fafaf9] border border-stone-200 p-8 max-w-xs w-full text-center relative shadow-lg animate-fade-in">
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
