export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center select-none overflow-hidden">
      {/* Subtle background radial pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      
      {/* Ambient soft glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-zinc-800/10 rounded-full blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center justify-center max-w-2xl gap-8">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extralight tracking-[0.4em] leading-[2.2] text-zinc-100 drop-shadow-sm animate-fade-in select-text">
          那些文字已經無關緊要了
        </h1>
        <div className="h-[1px] w-12 bg-zinc-800/80 animate-width-expand mt-1" />
        <p className="text-zinc-600 text-[10px] sm:text-xs tracking-[0.5em] uppercase font-mono mt-1 opacity-60 select-text animate-fade-in-delayed">
          Aphasia Web
        </p>
      </main>
    </div>
  );
}
