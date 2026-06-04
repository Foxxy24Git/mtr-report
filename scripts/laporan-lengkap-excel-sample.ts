// Contoh hasil "Download Laporan Lengkap" (Fase 3) — bangun .xlsx dari data
// sintetis (TANPA DB) agar mudah diperiksa visual.
//
// Jalankan: ./node_modules/.bin/tsx scripts/laporan-lengkap-excel-sample.ts
//   → menulis /tmp/REKAP_LAPORAN_LENGKAP_2026-06-01_sd_2026-06-07.xlsx
import { writeFileSync } from "node:fs";
import { computeSla } from "../lib/sla";
import type { LengkapTicket } from "../lib/reportLengkapQuery";
import { slaLabel } from "../lib/reportLengkapQuery";
import { SHIFT_NAMES } from "../lib/constants";
import {
  buildLengkapWorkbook,
  buildPeriodeLabel,
  fmtTanggalIndo,
} from "../lib/excelReportLengkap";

function tiket(over: Partial<LengkapTicket> & {
  waktuOpen: Date;
  waktuSelesai: Date | null;
  shiftKode: string;
  tanggal: string;
}): LengkapTicket {
  const sla = computeSla(over.waktuOpen, over.waktuSelesai);
  return {
    tanggal: over.tanggal,
    shiftKode: over.shiftKode,
    shiftLabel: SHIFT_NAMES[over.shiftKode] ?? `Shift ${over.shiftKode}`,
    petugas: over.petugas ?? "Kurnia Fajri",
    noTiket: over.noTiket ?? "ATM-001",
    kategori: "atm",
    atmKode: over.atmKode ?? "010101",
    atmNama: over.atmNama ?? "ATM IBUH",
    atmLokasi: over.atmLokasi ?? "Jl. Ibuh No.1, Payakumbuh",
    contactPerson: over.contactPerson ?? "WAG",
    jenisGangguan: over.jenisGangguan ?? "ATM Offline",
    sumberPenyebab: over.sumberPenyebab ?? "Listrik PLN Mati",
    metodePenanganan: over.metodePenanganan ?? "Penanganan gangguan oleh vendor ATM",
    vendor: over.vendor ?? "Bringin",
    noTiketVendor: over.noTiketVendor ?? "VND-1024",
    keterangan: over.keterangan ?? "-",
    waktuOpen: over.waktuOpen,
    waktuResponInternal: over.waktuResponInternal ?? null,
    waktuSelesai: over.waktuSelesai,
    status: over.waktuSelesai ? "selesai" : "proses",
    activities: over.activities ?? [
      { waktu: over.waktuOpen, teks: "Cek koneksi ATM & komunikasi vendor.", petugas: "Kurnia Fajri", isTindakLanjut: false },
      ...(over.waktuSelesai
        ? [{ waktu: over.waktuSelesai, teks: "ATM kembali online.", petugas: "Rian Putra", isTindakLanjut: false }]
        : [{ waktu: over.waktuOpen, teks: "", petugas: "Kurnia Fajri", isTindakLanjut: true }]),
    ],
    sla,
    slaLabel: slaLabel(sla),
  };
}

async function main() {
  const tickets: LengkapTicket[] = [
    tiket({
      tanggal: "01-06-2026", shiftKode: "A", petugas: "Kurnia Fajri",
      waktuOpen: new Date("2026-06-01T08:10:00+07:00"),
      waktuResponInternal: new Date("2026-06-01T08:15:00+07:00"),
      waktuSelesai: new Date("2026-06-01T09:40:00+07:00"),
    }),
    tiket({
      tanggal: "01-06-2026", shiftKode: "A", petugas: "Kurnia Fajri",
      atmKode: "010202", atmNama: "ATM PASAR", atmLokasi: "Pasar Ibuh Timur",
      jenisGangguan: "Jaringan Putus", sumberPenyebab: "Gangguan Link Telkom",
      contactPerson: "Budi (08123456789)", vendor: "Telkom", noTiketVendor: "TLK-77",
      waktuOpen: new Date("2026-06-01T11:00:00+07:00"),
      waktuResponInternal: new Date("2026-06-01T11:03:00+07:00"),
      waktuSelesai: null,
    }),
    tiket({
      tanggal: "01-06-2026", shiftKode: "B", petugas: "Rian Putra",
      atmKode: "010303", atmNama: "ATM KANTOR", atmLokasi: "Kantor Cabang Payakumbuh",
      jenisGangguan: "EDC Error", sumberPenyebab: "Perangkat Hang",
      waktuOpen: new Date("2026-06-01T16:20:00+07:00"),
      waktuResponInternal: new Date("2026-06-01T16:25:00+07:00"),
      waktuSelesai: new Date("2026-06-01T17:05:00+07:00"),
    }),
    tiket({
      tanggal: "02-06-2026", shiftKode: "A", petugas: "Dina Sari",
      atmKode: "010404", atmNama: "ATM RSUD", atmLokasi: "RSUD Adnaan WD",
      jenisGangguan: "ATM Offline", sumberPenyebab: "UPS Bermasalah",
      keterangan: "Pantau ulang shift berikutnya.",
      waktuOpen: new Date("2026-06-02T07:50:00+07:00"),
      waktuResponInternal: new Date("2026-06-02T07:55:00+07:00"),
      waktuSelesai: new Date("2026-06-02T10:30:00+07:00"),
    }),
  ];

  const dari = "2026-06-01";
  const sampai = "2026-06-07";
  const buffer = await buildLengkapWorkbook({
    periodeLabel: buildPeriodeLabel(dari, sampai),
    tanggalLabel: fmtTanggalIndo(sampai),
    tickets,
    signatures: {
      supervisi: "Andi Saputra",
      supervisiTtdPath: null, // tak ada contoh TTD digital di repo
      pimpinanInfra: "Hendra Wijaya",
      pimpinanDivisi: "Yusrizal (PJS)",
    },
  });

  const out = `/tmp/REKAP_LAPORAN_LENGKAP_${dari}_sd_${sampai}.xlsx`;
  writeFileSync(out, buffer);
  console.log(`OK → ${out} (${buffer.length} bytes, ${tickets.length} tiket)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
