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
    // Tiket "stress test": beberapa entri dengan teks panjang (>80 karakter →
    // wrap 2-3 baris di kolom N) diselingi entri tindak lanjut, jam berbeda tiap
    // entri. Untuk memastikan kolom M tetap sejajar & tinggi baris cukup.
    t({
      noTiket: "TKT-003",
      openShiftKode: "B",
      status: "proses",
      waktuSelesai: null,
      jenisGangguan: "Jaringan Kantor Offline",
      sumberPenyebab: "Putus jalur fiber optik",
      vendor: "Lintasarta",
      atm: { kodeAtm: "ATM07", namaAtm: "Kantor Cabang Simpang Empat" },
      activities: [
        {
          waktu: new Date("2026-06-02T09:10:00Z"),
          teks: "Menerima laporan jaringan kantor cabang Simpang Empat tidak dapat diakses, dilakukan pengecekan awal status link dan perangkat router di lokasi.",
          isTindakLanjutFlag: false,
        },
        {
          waktu: new Date("2026-06-02T09:38:00Z"),
          teks: "Konfirmasi ke vendor Lintasarta melalui WAG, vendor menginformasikan ada pekerjaan galian pihak ketiga yang memutus jalur fiber optik utama.",
          isTindakLanjutFlag: false,
        },
        {
          waktu: new Date("2026-06-02T10:00:00Z"),
          teks: "Eskalasi ke NOC vendor.",
          isTindakLanjutFlag: false,
        },
        {
          waktu: new Date("2026-06-02T10:30:00Z"),
          teks: "TINDAK LANJUT MONITORING SELANJUTNYA",
          isTindakLanjutFlag: true,
        },
        {
          waktu: new Date("2026-06-02T11:45:00Z"),
          teks: "Vendor menyampaikan estimasi penyambungan kembali jalur fiber optik paling cepat pukul 22:00 WIB, monitoring dilanjutkan berkala setiap 30 menit.",
          isTindakLanjutFlag: false,
        },
        {
          waktu: new Date("2026-06-02T12:50:00Z"),
          teks: "Cek ulang status perangkat, jaringan masih down dan belum ada perubahan dari sisi vendor.",
          isTindakLanjutFlag: false,
        },
        {
          waktu: new Date("2026-06-02T13:15:00Z"),
          teks: "TINDAK LANJUT MONITORING SELANJUTNYA",
          isTindakLanjutFlag: true,
        },
      ],
    }),
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
