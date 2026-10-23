import type { Metadata } from "next";
import MobileAppView from "@/components/MobileAppView";
import { isValidDeviceId } from "@/config/seedPresets";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const rawId = params?.deviceId || params?.device_id || params?.id;
  const deviceId =
    typeof rawId === "string" && isValidDeviceId(rawId.trim())
      ? rawId.trim()
      : null;

  const manifestUrl = deviceId
    ? `/manifest.webmanifest?deviceId=${encodeURIComponent(deviceId)}`
    : "/manifest.webmanifest";

  const appTitle = deviceId ? `Aphasia ${deviceId}` : "Aphasia";

  return {
    title: deviceId ? `Aphasia [DEV ${deviceId}]` : "Aphasia Mobile - Web View",
    manifest: manifestUrl,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: appTitle,
    },
  };
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = params?.deviceId || params?.device_id || params?.id;
  const initialDeviceId =
    typeof rawId === "string" && isValidDeviceId(rawId.trim())
      ? rawId.trim()
      : null;

  return <MobileAppView initialDeviceId={initialDeviceId} />;
}
