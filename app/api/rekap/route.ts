import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gatherReportData } from "@/lib/reportData";
import { buildReportWorkbook } from "@/lib/excelReport";
import { findUserShiftsForDate } from "@/lib/reportShiftLookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/rekap?mode=harian|user&tanggal=YYYY-MM-DD&shift=A&owner=<id>
 * Mengunduh laporan Form OPS-001 (.xlsx) identik template (PRD §4.D).
 *
 * mode=harian: `shift` kini OPSIONAL — bila kosong, shift dideteksi otomatis
 * dari sesi yang dijalankan `owner` (atau user login bila bukan superadmin)
 * pada `tanggal` tersebut. `owner` di sini HANYA dipakai untuk menebak shift,
 * BUKAN untuk memfilter isi laporan (laporan tetap laporan shift penuh).
 * Balasan 404 bila tidak ditemukan sesi, 409 (+ `candidates`) bila ditemukan
 * lebih dari satu sesi dan shift harus dipilih manual.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") === "user" ? "user" : "harian";
  const tanggal = sp.get("tanggal") ?? "";
  let shift = sp.get("shift");
  let owner = sp.get("owner");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (mode === "harian" && !shift) {
    // Deteksi otomatis: `owner` di sini HANYA untuk menebak shift, BUKAN
    // untuk memfilter laporan (owner tetap di-null-kan di bawah untuk
    // mode=harian, lihat blok berikutnya).
    const targetUserId =
      session.role === "superadmin" ? owner || session.sub : session.sub;
    const matches = await findUserShiftsForDate(targetUserId, tanggal);
    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Tidak ditemukan sesi shift untuk user ini pada tanggal tersebut." },
        { status: 404 }
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          error: "Ditemukan lebih dari satu sesi shift pada tanggal ini. Pilih shift secara manual.",
          candidates: matches.map((m) => m.shift),
        },
        { status: 409 }
      );
    }
    shift = matches[0].shift;
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

  const { data, filename } = await gatherReportData({
    tanggal,
    shift,
    ownerUserId: owner,
    includeCarryOver: mode === "harian",
    useShiftSessionWindow: mode === "harian",
  });
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
