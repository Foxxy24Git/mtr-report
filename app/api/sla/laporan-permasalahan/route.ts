import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, getProblemReport, type ProblemSortBy } from "@/lib/slaMonitoring";
import { buildProblemReportWorkbook } from "@/lib/problemReportExcel";
import { buildPeriodeLabel } from "@/lib/excelReportLengkap";
import { resolveReportLogoPath } from "@/lib/appSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const KATEGORI_LABEL: Record<string, string> = {
  semua: "Semua",
  atm: "ATM",
  jaringan: "Jaringan",
};

/**
 * GET /api/sla/laporan-permasalahan
 *   ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&kategori=atm|jaringan|semua&jenis=frekuensi|sla
 *
 * Mengunduh "Laporan Permasalahan ATM & Jaringan" (.xlsx, 1 sheet) sebagai acuan
 * koordinasi ke vendor. Lihat lib/problemReportExcel.ts & lib/slaMonitoring.ts.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const parsed = parseSlaFilters(sp);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const jenisRaw = sp.get("jenis") ?? "frekuensi";
  if (jenisRaw !== "frekuensi" && jenisRaw !== "sla") {
    return NextResponse.json(
      { error: "Jenis laporan harus frekuensi | sla." },
      { status: 400 }
    );
  }
  const sortBy = jenisRaw as ProblemSortBy;
  const { filter } = parsed;

  const [report, logoPath] = await Promise.all([
    getProblemReport(filter, sortBy),
    resolveReportLogoPath(),
  ]);

  const buffer = await buildProblemReportWorkbook({
    periodeLabel: buildPeriodeLabel(filter.dari, filter.sampai),
    kategoriLabel: KATEGORI_LABEL[filter.kategori] ?? "Semua",
    sortBy,
    items: report.items,
    logoPath,
  });

  const katFile = (KATEGORI_LABEL[filter.kategori] ?? "Semua").toUpperCase();
  const filename = `LAPORAN_PERMASALAHAN_${katFile}_${filter.dari}_sd_${filter.sampai}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "X-Report-Count": String(report.items.length),
      "Cache-Control": "no-store",
    },
  });
}
