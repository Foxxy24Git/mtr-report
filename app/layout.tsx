import type { Metadata } from "next";
import "./globals.css";
import { getLogoUrl } from "@/lib/appSettings";

const DEFAULT_ICON = "/logo-bank-nagari.png";

function iconType(url: string): string {
  const ext = url.split(".").pop()?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/png";
}

/** Favicon tab mengikuti logo aplikasi (app_settings.logo_url), bukan bawaan Next.js. */
export async function generateMetadata(): Promise<Metadata> {
  let icon = DEFAULT_ICON;
  try {
    icon = (await getLogoUrl()) || DEFAULT_ICON;
  } catch {
    // DB belum tersedia saat build image (prerender statis, mis. /_not-found)
    // — pakai ikon default, nilai asli tetap kepakai saat runtime normal.
  }
  return {
    title: "mtr-Report — Bank Nagari",
    description: "Sistem Monitoring & Tiket Gangguan ATM Bank Nagari",
    icons: { icon: [{ url: icon, type: iconType(icon) }] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
