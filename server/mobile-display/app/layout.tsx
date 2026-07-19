import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "No Side Here",
  description: "Aphasia Web Mobile Display",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-[#fafaf9] text-stone-800 antialiased">
        {children}
      </body>
    </html>
  );
}
