"use client";

import { useState } from "react";

export default function MujiInput() {
  const [text, setText] = useState("");
  const [modal, setModal] = useState<{
    show: boolean;
    isSuccess: boolean;
    message: string;
  }>({
    show: false,
    isSuccess: false,
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const length = text.trim().length;
    if (length >= 10 && length <= 200) {
      setModal({
        show: true,
        isSuccess: true,
        message: "傳送成功\n文字已記錄，感謝您的參與。",
      });
      setText(""); // Success - clear text
    } else {
      setModal({
        show: true,
        isSuccess: false,
        message: `傳送失敗\n字數限制為 10 - 200 字\n(目前輸入：${length} 字)`,
      });
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto mt-6 animate-fade-in-delayed">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative w-full">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="請輸入文字（10 - 200 字）..."
            maxLength={250} // Allow typing slightly over 200 to show the failure popup instead of hard cut-off
            rows={4}
            className="w-full px-4 py-3 bg-zinc-900/40 border border-zinc-800 focus:border-zinc-600 focus:outline-none text-zinc-200 placeholder-zinc-600 text-xs sm:text-sm tracking-widest leading-relaxed resize-none transition-colors duration-300 font-light"
          />
          <div className="absolute bottom-3 right-4 text-[10px] text-zinc-500 tracking-wider font-mono select-none">
            {text.length} / 200
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-light tracking-[0.3em] text-xs transition-colors duration-300 focus:outline-none"
        >
          送出 / SUBMIT
        </button>
      </form>

      {/* Muji Style Modal Overlay */}
      {modal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
          <div className="bg-zinc-950 border border-zinc-800 p-8 max-w-xs w-full text-center relative animate-fade-in">
            {/* Minimal Icon Indicator */}
            <div className="mb-4">
              {modal.isSuccess ? (
                <span className="text-zinc-300 text-4xl font-extralight">○</span>
              ) : (
                <span className="text-zinc-500 text-4xl font-extralight">✕</span>
              )}
            </div>
            
            {/* Message */}
            <div className="text-zinc-300 text-xs sm:text-sm font-extralight tracking-widest leading-loose whitespace-pre-line mb-6">
              {modal.message}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setModal({ ...modal, show: false })}
              className="px-6 py-2 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200 text-xs tracking-widest transition-colors duration-300 focus:outline-none"
            >
              確認 / OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
