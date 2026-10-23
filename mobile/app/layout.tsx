import type { Metadata, Viewport } from "next";
import "./globals.css";
import VConsoleLoader from "@/components/debug/VConsoleLoader";

export const metadata: Metadata = {
  title: "Aphasia Mobile - Web View",
  description: "Minimalist dynamic thick line visualization",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aphasia",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="h-full bg-white text-black" suppressHydrationWarning>
      <body
        className="h-full w-full bg-white text-black overflow-hidden select-none"
        suppressHydrationWarning
      >
        <VConsoleLoader />
        {children}
      </body>
    </html>
  );
}
