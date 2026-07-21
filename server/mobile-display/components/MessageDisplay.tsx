"use client";

export interface DisplayMessageData {
  id?: string | number;
  Text?: string;
  durationSec?: number;
  isPriority?: boolean;
  timestamp?: string;
}

interface MessageDisplayProps {
  message: DisplayMessageData | null;
  isLoading?: boolean;
}

export default function MessageDisplay({ message, isLoading }: MessageDisplayProps) {
  if (isLoading || !message) {
    return (
      <div className="w-full max-w-xl mx-auto p-10 sm:p-12 rounded-xl bg-white border border-neutral-200/80 shadow-xs flex flex-col items-center justify-center min-h-[280px] text-center">
        <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 font-mono text-xs tracking-widest uppercase">
          載入中 / 連線連動...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto p-8 sm:p-12 rounded-2xl bg-white border border-neutral-200 shadow-sm transition-all duration-300">
      {/* Monochrome Minimalist Status Tag */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-100">
        {message.isPriority ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono tracking-wider bg-neutral-900 text-white font-normal">
            • 最新寫入
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono tracking-wider bg-neutral-100 text-neutral-600 border border-neutral-200 font-normal">
            • 隨機播放
          </span>
        )}

        {message.timestamp && (
          <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* Main Text Content */}
      <div className="my-8 min-h-[140px] flex items-center justify-center px-2">
        <p className="text-2xl sm:text-3xl font-normal text-neutral-900 leading-relaxed tracking-normal font-sans text-center break-words select-text">
          {message.Text}
        </p>
      </div>
    </div>
  );
}
