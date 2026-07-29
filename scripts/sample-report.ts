// Contoh hasil export Form OPS-001 dengan data sintetis (tanpa DB).
// Jalankan: ./node_modules/.bin/tsx scripts/sample-report.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildReportWorkbook, type ReportData } from "../lib/excelReport";

const wib = (s: string) => new Date(`${s}+07:00`);

const data: ReportData = {
  hariTgl: "Selasa, 27 Mei 2026",
  tanggalLabel: "27 Mei 2026",
  namaPetugas: "Kurnia Fajri",
  shiftLabel: "Shift A (07:00–15:00)",
  jumlahHari: 31,
  tickets: [
    {
      no: 1,
      waktuKejadian: wib("2026-05-27T08:15:00"),
      unitKerja: "010101 – ATM CAPEM IBUH PYK",
      waktuRespon: "08:20",
      contactPerson: "Budi (0812-3456-7890)",
      jenisGangguan: "ATM Offline",
      sumberPenyebab: "Listrik PLN Mati",
      metodePenanganan: "Penanganan gangguan oleh vendor ATM",
      vendor: "Bringin",
      activities: [
        { waktu: wib("2026-05-27T08:20:00"), teks: "Cek koneksi ATM, ATM offline.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T09:05:00"), teks: "Koordinasi dengan PLN area, listrik padam.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T10:30:00"), teks: "Listrik kembali normal, ATM online.", isTindakLanjut: false },
      ],
      noTiketVendor: "VND-99812",
      waktuSelesai: wib("2026-05-27T10:35:00"),
      keterangan: "Selesai",
    },
    {
      no: 2,
      waktuKejadian: wib("2026-05-27T11:40:00"),
      unitKerja: "010205 – ATM KANTOR KAS BUKITTINGGI",
      waktuRespon: "-",
      contactPerson: "WAG",
      jenisGangguan: "ATM Out of Service",
      sumberPenyebab: "Cash Handler – Fatal",
      metodePenanganan: "Penanganan gangguan oleh vendor ATM",
      vendor: "Diebold",
      activities: [
        { waktu: wib("2026-05-27T11:45:00"), teks: "ATM out of service, cash handler error.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T12:30:00"), teks: "Vendor tiba di lokasi, penggantian part.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T13:15:00"), teks: "ATM kembali beroperasi normal.", isTindakLanjut: false },
      ],
      noTiketVendor: "-",
      waktuSelesai: wib("2026-05-27T13:20:00"),
      keterangan: "Selesai",
    },
    {
      no: 3,
      waktuKejadian: wib("2026-05-27T14:10:00"),
      unitKerja: "020110 – JARINGAN KANTOR CABANG PAYAKUMBUH",
      waktuRespon: "14:12",
      contactPerson: "Andi (0813-1111-2222)",
      jenisGangguan: "Jaringan Kantor Offline",
      sumberPenyebab: "Gangguan pada Jaringan Lintasarta",
      metodePenanganan: "Penanganan gangguan jaringan komunikasi pd Divisi TI",
      vendor: "Lintasarta",
      activities: [
        { waktu: wib("2026-05-27T14:12:00"), teks: "Jaringan kantor cabang down, eskalasi ke Lintasarta.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T14:55:00"), teks: "Lintasarta investigasi gangguan link.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T15:00:00"), teks: "", isTindakLanjut: true },
      ],
      noTiketVendor: "LA-55231",
      waktuSelesai: null,
      keterangan: "Diteruskan ke shift berikutnya",
    },
    // Tiket "stress test": banyak entri dengan teks panjang (>80 karakter →
    // wrap 2-3 baris di kolom L) diselingi entri tindak lanjut, jam berbeda tiap
    // entri. Untuk memastikan kolom K (jam) tetap sejajar & tinggi baris cukup.
    {
      no: 4,
      waktuKejadian: wib("2026-05-27T16:05:00"),
      unitKerja: "020304 – JARINGAN KANTOR CABANG SIMPANG EMPAT PASBAR",
      waktuRespon: "16:10",
      contactPerson: "Rani (0852-9999-1010)",
      jenisGangguan: "Jaringan Kantor Offline",
      sumberPenyebab: "Putus jalur fiber optik",
      metodePenanganan: "Penanganan gangguan jaringan komunikasi pd Divisi TI",
      vendor: "Lintasarta",
      activities: [
        {
          waktu: wib("2026-05-27T16:10:00"),
          teks: "Menerima laporan jaringan kantor cabang Simpang Empat tidak dapat diakses, dilakukan pengecekan awal status link dan perangkat router di lokasi.",
          isTindakLanjut: false,
        },
        {
          waktu: wib("2026-05-27T16:38:00"),
          teks: "Konfirmasi ke vendor Lintasarta melalui WAG, vendor menginformasikan ada pekerjaan galian pihak ketiga yang memutus jalur fiber optik utama.",
          isTindakLanjut: false,
        },
        { waktu: wib("2026-05-27T17:00:00"), teks: "Eskalasi ke NOC vendor.", isTindakLanjut: false },
        { waktu: wib("2026-05-27T17:30:00"), teks: "", isTindakLanjut: true },
        {
          waktu: wib("2026-05-27T18:45:00"),
          teks: "Vendor menyampaikan estimasi penyambungan kembali jalur fiber optik paling cepat pukul 22:00 WIB, monitoring dilanjutkan berkala setiap 30 menit.",
          isTindakLanjut: false,
        },
        {
          waktu: wib("2026-05-27T19:50:00"),
          teks: "Cek ulang status perangkat, jaringan masih down dan belum ada perubahan dari sisi vendor.",
          isTindakLanjut: false,
        },
        { waktu: wib("2026-05-27T20:15:00"), teks: "", isTindakLanjut: true },
      ],
      noTiketVendor: "LA-55402",
      waktuSelesai: null,
      keterangan: "Diteruskan ke shift berikutnya",
    },
  ],
  acChecks: [
    { urutan: 1, waktu: wib("2026-05-27T07:30:00"), room: "21°C", panel: "24°C", kiri: true, kanan: true, p12kiri: "Normal", p12kanan: "Normal" },
    { urutan: 2, waktu: wib("2026-05-27T11:00:00"), room: "22°C", panel: "24°C", kiri: true, kanan: true, p12kiri: "Normal", p12kanan: "Normal" },
    { urutan: 3, waktu: wib("2026-05-27T14:30:00"), room: "21°C", panel: "23°C", kiri: true, kanan: false, p12kiri: "Normal", p12kanan: "Perlu cek" },
  ],
  servers: [
    { label: "NPAY", awal: "Transaksi Normal", akhir: "Transaksi Normal" },
    { label: "AJ-ATMB", awal: "Normal", akhir: "Normal" },
    { label: "BI-FAST", awal: "Transaksi Normal", akhir: "Transaksi Normal" },
    { label: "PRIMA", awal: "Normal", akhir: "Gangguan" },
    { label: "Cip-Host", awal: "Normal", akhir: "Normal" },
  ],
  signatures: {
    penyerah: "Kurnia Fajri",
    penyerahTtdPath: null,
    penerima: "Rian Islami Putra",
    penerimaTtdPath: null,
    supervisi: "Tio Rahmayunda",
    supervisiApproved: true,
    supervisiTtdPath: null,
    pimpinanInfra: "Pimpinan Bag. Infrastruktur TI",
    pimpinanDivisi: "Pemimpin Divisi TI",
  },
};

async function main() {
  const buf = await buildReportWorkbook(data);
  const out = join(process.cwd(), "docs", "sample-laporan-OPS-001.xlsx");
  writeFileSync(out, buf);
  console.log(`Sample tersimpan: ${out} (${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
