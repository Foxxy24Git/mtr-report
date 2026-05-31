import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resolveRange } from "@/lib/weeklyRange";
import { buildWeeklyReportZip } from "@/lib/weeklyReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZIP_MIME = "application/zip";

/**
 * GET /api/rekap/weekly?dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 * Mengunduh ZIP berisi banyak Excel Form OPS-001, satu per kombinasi
 * (tanggal × user × shift) yang punya tiket pada rentang (PRD §4.D, §6).
 *
 * Petugas non-admin hanya menghasilkan laporan tiket miliknya sendiri.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const { fromKey, toKey } = resolveRange(sp.get("dari"), sp.get("sampai"));

  const ownerUserId = session.role === "superadmin" ? null : session.sub;

  const { buffer, filename, fileCount, errorCount } = await buildWeeklyReportZip({
    fromKey,
    toKey,
    ownerUserId,
  });

  if (fileCount === 0) {
    return NextResponse.json(
      { error: "Tidak ada tiket pada rentang tanggal tersebut." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": ZIP_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "X-Report-Count": String(fileCount),
      "X-Report-Errors": String(errorCount),
      "Cache-Control": "no-store",
    },
  });
}
