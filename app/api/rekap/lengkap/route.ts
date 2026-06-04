import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildLaporanLengkapExcel } from "@/lib/reportLengkapExcelData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/rekap/lengkap?dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 *   &supervisi=<id>&infra=<leaderId>&divisi=<leaderId>
 *
 * Mengunduh "Rekap Laporan Lengkap" (.xlsx, 1 sheet) — SEMUA tiket gabungan
 * semua petugas & shift pada rentang, dengan blok tanda tangan dari pilihan
 * modal (Fase 1). Lihat lib/excelReportLengkap.ts.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const dari = sp.get("dari") ?? "";
  const sampai = sp.get("sampai") ?? "";
  const supervisiId = sp.get("supervisi") ?? "";
  const pimpinanInfraId = sp.get("infra") ?? "";
  const pimpinanDivisiId = sp.get("divisi") ?? "";

  if (!DATE_RE.test(dari) || !DATE_RE.test(sampai)) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (dari > sampai) {
    return NextResponse.json(
      { error: "Tanggal 'dari' tidak boleh setelah tanggal 'sampai'." },
      { status: 400 }
    );
  }
  if (!supervisiId || !pimpinanInfraId || !pimpinanDivisiId) {
    return NextResponse.json(
      { error: "Supervisi serta pimpinan Infrastruktur & Divisi wajib dipilih." },
      { status: 400 }
    );
  }

  const { buffer, filename, count } = await buildLaporanLengkapExcel({
    tanggalDari: dari,
    tanggalSampai: sampai,
    supervisiId,
    pimpinanInfraId,
    pimpinanDivisiId,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "X-Report-Count": String(count),
      "Cache-Control": "no-store",
    },
  });
}
