import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gatherReportData } from "@/lib/reportData";
import { buildReportWorkbook } from "@/lib/excelReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/rekap?mode=harian|user&tanggal=YYYY-MM-DD&shift=A&owner=<id>
 * Mengunduh laporan Form OPS-001 (.xlsx) identik template (PRD §4.D).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") === "user" ? "user" : "harian";
  const tanggal = sp.get("tanggal") ?? "";
  const shift = sp.get("shift");
  let owner = sp.get("owner");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (mode === "harian" && !shift) {
    return NextResponse.json(
      { error: "Shift wajib dipilih untuk laporan harian." },
      { status: 400 }
    );
  }

  // Per-user: petugas biasa hanya boleh mengunduh tiket miliknya sendiri.
  if (mode === "user") {
    if (session.role !== "superadmin") owner = session.sub;
    if (!owner) {
      return NextResponse.json(
        { error: "User wajib dipilih untuk laporan per-user." },
        { status: 400 }
      );
    }
  } else {
    owner = null;
  }

  const { data, filename } = await gatherReportData({ tanggal, shift, ownerUserId: owner });
  const buffer = await buildReportWorkbook(data);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
