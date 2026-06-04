// Smoke test render LOGBOOK .xlsx ke ./tmp (tanpa DB) untuk diperiksa manual.
//   ./node_modules/.bin/tsx scripts/logbook-sample.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildLogbookRows, type LogbookTicketInput } from "../lib/logbookRows";
import { buildLogbookWorkbook } from "../lib/logbookExcel";
import type { LogbookData } from "../lib/logbookData";

function t(over: Partial<LogbookTicketInput>): LogbookTicketInput {
  return {
    noTiket: "TKT-001",
    openShiftKode: "A",
    waktuOpen: new Date("2026-06-01T03:00:00Z"),
    waktuResponInternal: new Date("2026-06-01T03:10:00Z"),
    cpTipe: "pic",
    cpNama: "Budi",
    cpTelp: "0812",
    jenisGangguan: "ATM Offline",
    sumberPenyebab: "Jaringan komunikasi",
    metodePenanganan: "Restart modem",
    vendor: "Vendor X",
    noTiketVendor: "V-99",
    status: "selesai",
    waktuSelesai: new Date("2026-06-01T05:00:00Z"),
    keterangan: "OK",
    atm: { kodeAtm: "ATM01", namaAtm: "Cabang Utama" },
    activities: [
      { waktu: new Date("2026-06-01T03:05:00Z"), teks: "Cek awal, ATM offline", isTindakLanjutFlag: false },
      { waktu: new Date("2026-06-01T11:00:00Z"), teks: "TINDAK LANJUT MONITORING SELANJUTNYA", isTindakLanjutFlag: true },
      { waktu: new Date("2026-06-01T12:30:00Z"), teks: "Ditangani vendor, normal kembali", isTindakLanjutFlag: false },
    ],
    ...over,
  };
}

async function main() {
  const rows = buildLogbookRows([
    t({}),
    t({ noTiket: "TKT-002", openShiftKode: "C", status: "proses", waktuSelesai: null, atm: null }),
  ]);
  const data: LogbookData = {
    namaPetugas: "Kurnia Fajri",
    username: "mtr1",
    periodeLabel: "01 Juni 2026 s/d 30 Juni 2026",
    rows,
  };
  const buf = await buildLogbookWorkbook(data, "LOGBOOK Kurnia Fajri");
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  const out = join(process.cwd(), "tmp", "LOGBOOK_mtr1_2026-06-01_sd_2026-06-30.xlsx");
  writeFileSync(out, buf);
  console.log(`OK rows=${rows.length} bytes=${buf.length} -> ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
