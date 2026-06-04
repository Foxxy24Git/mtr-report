// Contoh hasil "Laporan Permasalahan" (Monitoring SLA — Fase 3): hasilkan satu
// berkas .xlsx ke ./tmp untuk diperiksa manual.
//
// Jalankan:
//   ./node_modules/.bin/tsx scripts/sla-laporan-permasalahan-sample.ts
//   ./node_modules/.bin/tsx scripts/sla-laporan-permasalahan-sample.ts 2026-05-01 2026-05-31 semua frekuensi
//   arg1=dari  arg2=sampai  arg3=kategori(atm|jaringan|semua)  arg4=jenis(frekuensi|sla)

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import {
  defaultRange,
  getProblemReport,
  type SlaFilter,
  type SlaKategori,
  type ProblemSortBy,
} from "../lib/slaMonitoring";
import { buildProblemReportWorkbook } from "../lib/problemReportExcel";
import { buildPeriodeLabel } from "../lib/excelReportLengkap";

const KATEGORI_LABEL: Record<string, string> = {
  semua: "Semua",
  atm: "ATM",
  jaringan: "Jaringan",
};

async function main() {
  const def = defaultRange();
  const dari = process.argv[2] ?? def.dari;
  const sampai = process.argv[3] ?? def.sampai;
  const kategori = (process.argv[4] as SlaKategori) ?? "semua";
  const jenis = (process.argv[5] as ProblemSortBy) ?? "frekuensi";
  const filter: SlaFilter = { dari, sampai, kategori };

  const report = await getProblemReport(filter, jenis);
  console.log(
    `Laporan Permasalahan — ${dari} s/d ${sampai} · kategori=${kategori} · jenis=${jenis}`
  );
  console.log(`Total ATM/lokasi: ${report.items.length}`);
  for (const it of report.items.slice(0, 8)) {
    console.log(
      `  ${it.kodeAtm} | ${it.namaAtm} | ${it.cabang} | ${it.jumlahGangguan}x | ` +
        `${it.jenisGangguanTersering} | ${it.totalDowntimeLabel} | SLA ${it.slaPersenLabel}`
    );
  }

  const buffer = await buildProblemReportWorkbook({
    periodeLabel: buildPeriodeLabel(dari, sampai),
    kategoriLabel: KATEGORI_LABEL[kategori] ?? "Semua",
    sortBy: jenis,
    items: report.items,
  });

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const katFile = (KATEGORI_LABEL[kategori] ?? "Semua").toUpperCase();
  const outPath = join(outDir, `LAPORAN_PERMASALAHAN_${katFile}_${dari}_sd_${sampai}.xlsx`);
  writeFileSync(outPath, buffer);
  console.log(`\nFile contoh: ${outPath} (${buffer.length} bytes)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
