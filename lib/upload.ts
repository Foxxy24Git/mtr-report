import "server-only";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** Jenis berkas gambar yang diizinkan (foto profil & tanda tangan). */
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/** Logo aplikasi: PNG/JPG + SVG (vektor, dipakai untuk tampilan UI). */
const ALLOWED_LOGO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export type UploadKind = "foto" | "ttd" | "logo";

export interface UploadResult {
  ok: true;
  url: string; // relatif terhadap /public, mis. "/uploads/ttd/<id>-<ts>.png"
}
export interface UploadError {
  ok: false;
  status: number;
  error: string;
}

const PUBLIC_DIR = join(process.cwd(), "public");

/**
 * Simpan gambar yang diunggah ke public/uploads/<kind>.
 * Mengembalikan URL publik yang dapat dibaca oleh <img> & generator Excel
 * (excelReport membaca dari public/<url>). File lama (prev) dihapus bila ada.
 */
export async function saveImageUpload(
  file: unknown,
  kind: UploadKind,
  ownerId: string,
  prevUrl?: string | null
): Promise<UploadResult | UploadError> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, status: 400, error: "Berkas gambar wajib dipilih." };
  }
  const isLogo = kind === "logo";
  const ext = (isLogo ? ALLOWED_LOGO : ALLOWED)[file.type];
  if (!ext) {
    return {
      ok: false,
      status: 415,
      error: isLogo
        ? "Format file harus PNG, JPG, atau SVG."
        : "Format tidak didukung. Gunakan PNG, JPG, atau WEBP.",
    };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, status: 413, error: "Ukuran file maksimal 2MB." };
  }

  const dir = join(PUBLIC_DIR, "uploads", kind);
  await mkdir(dir, { recursive: true });

  // Logo: nama pakai timestamp saja (hanya 1 logo aktif). Lainnya per-owner.
  const filename = isLogo
    ? `logo_${Date.now()}.${ext}`
    : `${ownerId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, filename), buffer);

  // Hapus berkas lama (hanya jika berada di dalam folder uploads).
  if (prevUrl && prevUrl.startsWith("/uploads/")) {
    await rm(join(PUBLIC_DIR, prevUrl.replace(/^\//, "")), { force: true }).catch(
      () => {}
    );
  }

  return { ok: true, url: `/uploads/${kind}/${filename}` };
}
