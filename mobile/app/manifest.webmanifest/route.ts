import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId } from "@/config/seedPresets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawId =
    searchParams.get("deviceId") ||
    searchParams.get("device_id") ||
    searchParams.get("id");
  const deviceId = rawId && isValidDeviceId(rawId.trim()) ? rawId.trim() : null;

  const startUrl = deviceId ? `/?deviceId=${encodeURIComponent(deviceId)}` : "/";
  const name = deviceId ? `Aphasia [DEV ${deviceId}]` : "Aphasia Mobile";
  const shortName = deviceId ? `Aphasia ${deviceId}` : "Aphasia";

  const manifest = {
    name,
    short_name: shortName,
    description: "Minimalist dynamic thick line visualization",
    start_url: startUrl,
    id: startUrl,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
