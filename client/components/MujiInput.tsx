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
            className="w-full px-4 py-3 bg-[#f5f5f4] border border-stone-200 focus:border-stone-400 focus:outline-none text-stone-800 placeholder-stone-400 text-base md:text-sm tracking-widest leading-relaxed resize-none transition-colors duration-300 font-light"
          />
          <div className="absolute bottom-3 right-4 text-[10px] text-stone-400 tracking-wider font-mono select-none">
            {text.length} / 200
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-stone-100 font-light tracking-[0.3em] text-xs transition-colors duration-300 focus:outline-none"
        >
          送出 / SUBMIT
        </button>
      </form>

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
              className="px-6 py-2 border border-stone-200 hover:border-stone-400 text-stone-500 hover:text-stone-800 text-xs tracking-widest transition-colors duration-300 focus:outline-none"
            >
              確認 / OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
