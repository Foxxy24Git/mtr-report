import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mtr-Report — Bank Nagari",
  description: "Sistem Monitoring & Tiket Gangguan ATM Bank Nagari",
};

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
