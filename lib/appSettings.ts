import "server-only";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
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
 * Rasterisasi SVG → PNG (ExcelJS tidak bisa menyisipkan SVG). Hasil di-cache
 * sebagai berkas <nama>.png bersebelahan dengan SVG-nya; di-regenerasi hanya
 * bila SVG lebih baru. Mengembalikan path PNG, atau null bila konversi gagal.
 */
async function rasterizeSvgToPng(svgPath: string): Promise<string | null> {
  const pngPath = svgPath.replace(/\.svg$/i, "") + ".png";
  try {
    if (
      existsSync(pngPath) &&
      statSync(pngPath).mtimeMs >= statSync(svgPath).mtimeMs
    ) {
      return pngPath;
    }
    // density tinggi agar logo tetap tajam; lebar dibatasi agar berkas ringan.
    await sharp(svgPath, { density: 300 })
      .resize({ width: 400 })
      .png()
      .toFile(pngPath);
    return existsSync(pngPath) ? pngPath : null;
  } catch {
    return null;
  }
}

/**
 * Path filesystem logo untuk laporan Excel. ExcelJS tidak bisa menyisipkan SVG,
 * jadi: logo upload PNG/JPG → pakai langsung; SVG → rasterisasi ke PNG (cache);
 * konversi gagal/kosong → fallback PNG default; tak ada berkas sama sekali →
 * null (laporan skip logo). Lihat keputusan desain §6.
 */
export async function resolveReportLogoPath(): Promise<string | null> {
  const url = await getLogoUrl();
  if (url) {
    const ext = url.split(".").pop()?.toLowerCase();
    const p = join(PUBLIC_DIR, url.replace(/^\//, ""));
    if ((ext === "png" || ext === "jpg" || ext === "jpeg") && existsSync(p)) {
      return p;
    }
    if (ext === "svg" && existsSync(p)) {
      const png = await rasterizeSvgToPng(p);
      if (png) return png;
    }
    // Berkas hilang atau konversi gagal → jatuh ke logo default di bawah.
  }
  return existsSync(DEFAULT_LOGO_PNG) ? DEFAULT_LOGO_PNG : null;
}
