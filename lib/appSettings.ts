import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

const PUBLIC_DIR = join(process.cwd(), "public");
/** Logo default bawaan aplikasi (fallback bila belum ada upload). */
const DEFAULT_LOGO_PNG = join(PUBLIC_DIR, "logo-bank-nagari.png");

/** URL logo aktif (relatif /public) atau null bila pakai default. */
export async function getLogoUrl(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "logo_url" },
    select: { value: true },
  });
  return row?.value ?? null;
}

/**
 * Path filesystem logo untuk laporan Excel. ExcelJS tidak bisa menyisipkan SVG,
 * jadi: logo upload PNG/JPG → pakai; SVG/kosong → fallback PNG default; tak ada
 * berkas sama sekali → null (laporan skip logo). Lihat keputusan desain §6.
 */
export async function resolveReportLogoPath(): Promise<string | null> {
  const url = await getLogoUrl();
  if (url) {
    const ext = url.split(".").pop()?.toLowerCase();
    if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      const p = join(PUBLIC_DIR, url.replace(/^\//, ""));
      if (existsSync(p)) return p;
    }
    // SVG atau berkas hilang → jatuh ke logo default di bawah.
  }
  return existsSync(DEFAULT_LOGO_PNG) ? DEFAULT_LOGO_PNG : null;
}
