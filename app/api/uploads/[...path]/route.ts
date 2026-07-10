import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, normalize } from "node:path";

/**
 * GET /api/uploads/[...path] — sajikan file di public/uploads/* langsung dari
 * disk. Dibutuhkan karena Next.js `output: "standalone"` cuma menyajikan file
 * yang ada di public/ saat build time; file hasil upload runtime (bind mount
 * volume Docker) tidak pernah dikenali static file server bawaan Next dan
 * selalu 404 walau fisiknya ada di disk. Lihat rewrite di next.config.ts.
 */

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const relative = normalize(join(...segments));

  // Cegah path traversal ("..") keluar dari folder uploads.
  if (relative.startsWith("..") || relative.includes("..")) {
    return NextResponse.json({ error: "Path tidak valid." }, { status: 400 });
  }

  const filePath = join(UPLOADS_DIR, relative);
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 404 });
  }

  try {
    await stat(filePath);
    const buffer = await readFile(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 404 });
  }
}
