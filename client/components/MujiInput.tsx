"use client";

import { useState, useEffect } from "react";
import { Turnstile } from "@marsstrikes/react-turnstile";
import ScrambleText from "@/components/ScrambleText";

interface MujiInputProps {
  isVisible?: boolean;
  turnstileToken?: string;
}

export default function MujiInput({
  isVisible = true,
  turnstileToken: propToken = "",
}: MujiInputProps) {
  const [text, setText] = useState("");
  const [token, setToken] = useState(propToken);
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const length = text.trim().length;

    if (length < 10 || length > 200) {
      setModal({
        show: true,
        isSuccess: false,
        message: `傳送失敗\n字數限制為 10 - 200 字\n(目前輸入：${length} 字)`,
      });
      return;
    }

    if (!activeToken) {
      setModal({
        show: true,
        isSuccess: false,
        message: "傳送失敗\n未取得有效的安全驗證 token",
      });
      return;
    }

    setLoading(true);

    try {
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

      if (res.ok && data.success) {
        setModal({
          show: true,
          isSuccess: true,
          message: data.message || "傳送成功\n文字已記錄，感謝您的參與。",
        });
        setText("");
      } else {
        setModal({
          show: true,
          isSuccess: false,
          message: `傳送失敗\n${data.message || "安全驗證未通過"}`,
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
      setModal({
        show: true,
        isSuccess: false,
        message: "傳送失敗\n網路連線或伺服器發生錯誤",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className={`w-full max-w-sm mx-auto mt-6 ${
          isVisible ? "animate-fade-in-delayed" : "opacity-0 pointer-events-none"
        }`}
      >
        <form id="muji-form" onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            {/* Custom label instead of placeholder */}
            <div className="text-stone-400 text-[11px] tracking-[0.2em] text-left select-none opacity-80">
              <ScrambleText
                text="請輸入文字（10 - 200 字）"
                trigger={isVisible}
                delay={750}
                duration={1000}
              />
            </div>

            <div className="relative w-full">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={250} // Allow typing slightly over 200 to show failure popup
                rows={6}
                className="w-full px-0 py-2 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-stone-800 text-2xl md:text-xl tracking-widest leading-relaxed resize-none transition-colors duration-300 font-light"
              />

              {/* Custom breathing cursor '|' when empty */}
              {text === "" && (
                <div className="absolute top-2 left-0 text-stone-400 select-none pointer-events-none text-2xl md:text-xl font-light animate-cursor-breath">
                  |
                </div>
              )}

              {/* Character indicator */}
              <div className="text-right text-[10px] text-stone-400 tracking-wider font-mono select-none mt-1">
                {text.length} / 200
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

        <button
          type="submit"
          form="muji-form"
          disabled={!activeToken || loading}
          className={`w-full py-3 bg-stone-800 text-stone-100 font-light tracking-[0.3em] text-xs transition-all duration-300 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
            !activeToken || loading
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-stone-700 cursor-pointer shadow-md"
          }`}
        >
          {loading ? (
            "處理中 / SUBMITTING..."
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

      {/* Muji Style Modal Overlay */}
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
