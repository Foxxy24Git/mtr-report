"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

/** Logo bawaan aplikasi (dipakai bila belum ada logo khusus). */
const DEFAULT_LOGO = "/logo-bank-nagari.svg";

interface Props {
  /** URL logo aktif (dari app_settings). Null/kosong → logo bawaan. */
  logoUrl?: string | null;
  /** Ukuran kotak putih (background) logo. Beri w-* h-* di sini. */
  className?: string;
  /** Ukuran gambar logo di dalam kotak putih. Default: ikut ukuran kotak putih. */
  logoClassName?: string;
  alt?: string;
  priority?: boolean;
}

/**
 * Menampilkan logo aplikasi. Bila ada logo khusus yang diunggah Super Admin,
 * gambar itu yang dipakai; jika tidak, jatuh ke logo SVG Bank Nagari bawaan.
 */
export function AppLogo({
  logoUrl,
  className,
  logoClassName,
  alt = "Logo Bank Nagari",
  priority = false,
}: Props) {
  const src = logoUrl || DEFAULT_LOGO;
  return (
    <div
      className={cn(
        "bg-white rounded-lg p-1.5 flex items-center justify-center",
        className
      )}
    >
      <div className={cn("relative", logoClassName ?? "w-full h-full")}>
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain p-0.5"
          priority={priority}
          // Logo unggahan dilewatkan tanpa optimizer (berkas dinamis di /public).
          unoptimized={Boolean(logoUrl)}
        />
      </div>
    </div>
  );
}
