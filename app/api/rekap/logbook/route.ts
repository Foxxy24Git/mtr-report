import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gatherLogbookData } from "@/lib/logbookData";
import { buildLogbookWorkbook } from "@/lib/logbookExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/rekap/logbook?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&user=<id>
 *
 * Logbook pribadi (PRD revisi §4.D): SEMUA tiket yang DI-OPEN petugas pada
 * rentang tanggal, semua shift & semua status, dengan kronologi kegiatan
 * lengkap. Petugas biasa hanya boleh logbook miliknya sendiri; superadmin
 * boleh memilih user mana pun.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const dari = sp.get("dari") ?? "";
  const sampai = sp.get("sampai") ?? "";
  let userId = sp.get("user");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (dari > sampai) {
    return NextResponse.json(
      { error: "Tanggal 'dari' tidak boleh setelah tanggal 'sampai'." },
      { status: 400 }
    );
  }

  // Petugas biasa terkunci ke dirinya sendiri; hanya superadmin boleh pilih user.
  if (session.role !== "superadmin") userId = session.sub;
  if (!userId) {
    return NextResponse.json(
      { error: "User wajib dipilih." },
      { status: 400 }
    );
  }

  const { data, filename, sheetName } = await gatherLogbookData({
    dari,
    sampai,
    userId,
  });
  const buffer = await buildLogbookWorkbook(data, sheetName);

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
