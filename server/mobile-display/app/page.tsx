import SocketManager from "@/components/SocketManager";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafaf9] p-6 text-center select-none relative">
      <SocketManager />

      <h1 className="text-2xl sm:text-3xl font-extralight tracking-[0.4em] text-stone-800 uppercase font-mono drop-shadow-sm">
        No Side Here
      </h1>
    </div>
  );
}
