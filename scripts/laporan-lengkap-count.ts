// Verifikasi Fase 2 "Download Laporan Lengkap": log jumlah tiket gabungan
// (semua petugas & shift) untuk satu rentang tanggal.
//
// Jalankan: ./node_modules/.bin/tsx scripts/laporan-lengkap-count.ts 2026-06-01 2026-06-04
//   arg1 = dari (YYYY-MM-DD), arg2 = sampai (default = dari).
import { prisma } from "../lib/prisma";
import {
  buildLengkapTicketWhere,
  computeLengkapRange,
  lengkapTicketInclude,
  mapLengkapTicket,
} from "../lib/reportLengkapQuery";

async function main() {
  const dari = process.argv[2] ?? "2026-06-01";
  const sampai = process.argv[3] ?? dari;

  const range = buildLengkapTicketWhere(computeLengkapRange(dari, sampai));
  const rows = await prisma.ticket.findMany({
    where: range,
    orderBy: [{ createdAt: "asc" }, { openShiftKode: "asc" }],
    include: lengkapTicketInclude,
  });
  const tickets = rows.map(mapLengkapTicket);

  console.log(`\nRentang ${dari} s/d ${sampai} → ${tickets.length} tiket\n`);

  const perShift = tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.shiftLabel] = (acc[t.shiftLabel] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Per shift:", perShift);

  for (const t of tickets.slice(0, 10)) {
    console.log(
      `  ${t.tanggal} | ${t.shiftLabel} | ${t.petugas} | ${t.noTiket} | ${t.status} | SLA ${t.slaLabel} | ${t.activities.length} kegiatan`
    );
  }
  if (tickets.length > 10) console.log(`  … +${tickets.length - 10} tiket lain`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
