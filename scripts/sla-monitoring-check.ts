// Verifikasi Fase 1 "Monitoring SLA": log hasil agregasi semua endpoint untuk
// satu rentang tanggal (default: 30 hari terakhir).
//
// Jalankan:
//   ./node_modules/.bin/tsx scripts/sla-monitoring-check.ts
//   ./node_modules/.bin/tsx scripts/sla-monitoring-check.ts 2026-05-05 2026-06-04 semua
//   arg1 = dari (YYYY-MM-DD), arg2 = sampai, arg3 = kategori (atm|jaringan|semua)
import { prisma } from "../lib/prisma";
import {
  defaultRange,
  getByJenisGangguan,
  getBySumberPenyebab,
  getLowestSla,
  getMostTrouble,
  getSlaSummary,
  type SlaFilter,
  type SlaKategori,
} from "../lib/slaMonitoring";

async function main() {
  const def = defaultRange();
  const dari = process.argv[2] ?? def.dari;
  const sampai = process.argv[3] ?? def.sampai;
  const kategori = (process.argv[4] as SlaKategori) ?? "semua";
  const filter: SlaFilter = { dari, sampai, kategori };

  console.log(`\n=== Monitoring SLA — ${dari} s/d ${sampai} · kategori=${kategori} ===`);

  const summary = await getSlaSummary(filter);
  console.log(`\n[summary]`);
  console.log(`  Total menit periode : ${summary.totalMenitPeriode}`);
  console.log(`  Total tiket         : ${summary.totalTiket}`);
  console.log(`  Total downtime (mnt): ${summary.totalDowntimeMenit}`);
  console.log(`  Rata-rata SLA semua : ${summary.rataSlaSemuaLabel}`);
  console.log(`  ATM bermasalah      : ${summary.atmBermasalah}`);
  console.log(`  Jaringan bermasalah : ${summary.jaringanBermasalah}`);
  console.log(
    `  SLA ATM/Jaringan    : ${summary.perKategori.atm.rataSlaLabel} (${summary.perKategori.atm.totalTiket} tiket) / ${summary.perKategori.jaringan.rataSlaLabel} (${summary.perKategori.jaringan.totalTiket} tiket)`
  );

  const lowest = await getLowestSla(filter);
  console.log(`\n[lowest] ${lowest.items.length} ATM (SLA terendah)`);
  for (const r of lowest.items.slice(0, 10)) {
    console.log(
      `  ${r.kodeAtm} | ${r.lokasi} | ${r.vendor} | tiket ${r.totalTiket} | downtime ${r.totalDowntimeMenit}m | SLA ${r.slaPersenLabel}`
    );
  }

  const trouble = await getMostTrouble(filter);
  console.log(`\n[most-trouble] ${trouble.items.length} ATM (tiket terbanyak)`);
  for (const r of trouble.items.slice(0, 10)) {
    console.log(
      `  ${r.kodeAtm} | ${r.lokasi} | ${r.kategori} | total ${r.jumlahTiket} (selesai ${r.jumlahSelesai}, proses ${r.jumlahProses})`
    );
  }

  const jenis = await getByJenisGangguan(filter);
  console.log(`\n[by-jenis-gangguan] total ${jenis.total} tiket`);
  for (const r of jenis.items.slice(0, 10)) {
    console.log(`  ${r.nilai}: ${r.jumlah} (${(r.persentase * 100).toFixed(1)}%)`);
  }

  const sumber = await getBySumberPenyebab(filter);
  console.log(`\n[by-sumber-penyebab] total ${sumber.total} tiket`);
  for (const r of sumber.items.slice(0, 10)) {
    console.log(`  ${r.nilai}: ${r.jumlah} (${(r.persentase * 100).toFixed(1)}%)`);
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
