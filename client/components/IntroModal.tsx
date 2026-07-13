"use client";

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IntroModal({ isOpen, onClose }: IntroModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none">
      <div className="bg-[#fafaf9] border border-stone-200 p-8 max-w-md w-full text-center relative shadow-lg animate-fade-in">
        {/* Title */}
        <h2 className="text-stone-800 text-sm sm:text-base font-normal tracking-[0.25em] mb-6">
          互動理念 與 操作說明
        </h2>

        {/* Empty placeholder paragraphs for user to edit */}
        <div className="text-stone-500 text-xs sm:text-sm font-light tracking-widest leading-loose text-left whitespace-pre-line mb-8 min-h-[160px] overflow-y-auto px-1">
          {"\n\n\n\n（此處留白，供後續填寫操作說明與互動理念）\n\n\n\n"}
        </div>

        {/* Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-stone-100 font-light tracking-[0.3em] text-xs transition-colors duration-300 focus:outline-none"
        >
          進入體驗 / ENTER
        </button>
      </div>
    </div>
  );
}
