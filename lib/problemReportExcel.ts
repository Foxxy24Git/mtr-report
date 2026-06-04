// Generator "Laporan Permasalahan ATM & Jaringan" (Monitoring SLA — Fase 3).
//
// Membangun SATU sheet .xlsx ("LAPORAN PERMASALAHAN") berisi rekap per-ATM
// untuk acuan koordinasi ke vendor: jumlah gangguan, jenis & sumber penyebab
// tersering, total downtime, dan SLA periode. Diurut sesuai jenis laporan
// (frekuensi tiket terbanyak / SLA terendah). Baris paling kritis di-highlight
// merah muda agar mudah jadi sorotan. Data dari lib/slaMonitoring.getProblemReport.
//
// Fungsi murni: menerima data siap-pakai (tanpa I/O DB) agar bisa dipakai API
// route maupun skrip contoh.

import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ProblemRow, ProblemSortBy } from "@/lib/slaMonitoring";

const TZ = "Asia/Jakarta";

// Font & warna mengikuti laporan lain (Swis721 Lt BT → fallback Arial otomatis).
const FONT = "Swis721 Lt BT";
const BLACK = "FF000000";
const HEADER_FILL = "FF83CAFF"; // biru muda header tabel (sesuai spek)
const HIGHLIGHT_FILL = "FFFFD1DC"; // merah muda — baris sorotan ke vendor
const STRIPE_FILL = "FFF7FAFC"; // zebra lembut baris biasa

export interface ProblemReportData {
  /** "01 Mei 2026 s/d 31 Mei 2026". */
  periodeLabel: string;
  /** Label kategori untuk header: "Semua" | "ATM" | "Jaringan". */
  kategoriLabel: string;
  /** Jenis laporan yang dipilih (menentukan urutan & judul kolom highlight). */
  sortBy: ProblemSortBy;
  items: ProblemRow[];
  /** Path FS absolut logo PNG/JPG (SVG tak didukung ExcelJS). */
  logoPath?: string | null;
}

// ----------------------------- Helper styling -----------------------------

const THIN = { style: "thin" as const, color: { argb: BLACK } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function font(opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return { name: FONT, color: { argb: BLACK }, ...opts };
}
function box(cell: ExcelJS.Cell) {
  cell.border = ALL_BORDERS;
}
function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

// ----------------------------- Kolom A–M -----------------------------

const COL_WIDTHS: Record<string, number> = {
  A: 4.5, // No
  B: 14.0, // Kode ATM
  C: 26.0, // Nama / Lokasi
  D: 16.0, // Cabang
  E: 16.0, // Vendor ATM
  F: 16.0, // Vendor Jaringan
  G: 10.0, // Kategori
  H: 11.0, // Jumlah Gangguan
  I: 22.0, // Jenis Gangguan Tersering
  J: 22.0, // Sumber Penyebab Tersering
  K: 13.0, // Total Downtime
  L: 9.0, // SLA%
  M: 26.0, // Keterangan (catatan tindak lanjut — dikosongkan)
};
const LAST_COL = "M";

// Rata kiri untuk kolom teks; sisanya center.
const LEFT_COLS = new Set(["C", "D", "E", "F", "I", "J", "M"]);

const HEADERS: [string, string][] = [
  ["A", "No"],
  ["B", "Kode ATM"],
  ["C", "Nama / Lokasi"],
  ["D", "Cabang"],
  ["E", "Vendor ATM"],
  ["F", "Vendor Jaringan"],
  ["G", "Kategori"],
  ["H", "Jumlah Gangguan"],
  ["I", "Jenis Gangguan Tersering"],
  ["J", "Sumber Penyebab Tersering"],
  ["K", "Total Downtime"],
  ["L", "SLA%"],
  ["M", "Keterangan / Tindak Lanjut"],
];

// Jumlah baris teratas yang di-highlight sebagai sorotan ke vendor.
const HIGHLIGHT_TOP = 5;

// ----------------------------- Util waktu -----------------------------

/** "04 Juni 2026 14:05" (WIB) untuk baris "Tanggal cetak". */
function fmtCetak(d: Date): string {
  const tgl = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
  const jam = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
  return `${tgl} ${jam} WIB`;
}

function kategoriText(k: ProblemRow["kategori"]): string {
  if (k === "atm") return "ATM";
  if (k === "jaringan") return "Jaringan";
  return "-";
}

// ----------------------------- Generator -----------------------------

export async function buildProblemReportWorkbook(
  data: ProblemReportData
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "mtr-Report";
  wb.created = new Date();

  const ws = wb.addWorksheet("LAPORAN PERMASALAHAN", {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 15 },
  });

  for (const [col, width] of Object.entries(COL_WIDTHS)) {
    ws.getColumn(col).width = width;
  }
  ws.properties.defaultColWidth = 12;

  // ------------------- Logo (pojok kiri atas) -------------------
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  const logoPath =
    data.logoPath ?? join(process.cwd(), "public", "logo-bank-nagari.png");
  if (logoPath && existsSync(logoPath)) {
    const lower = logoPath.toLowerCase();
    const extension =
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
    const imgId = wb.addImage({
      buffer: readFileSync(logoPath) as unknown as ArrayBuffer,
      extension,
    });
    ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 84, height: 52 } });
  }

  // ------------------- Header judul -------------------
  ws.mergeCells("C1:L1");
  const t1 = ws.getCell("C1");
  t1.value = "LAPORAN PERMASALAHAN ATM & JARINGAN";
  t1.font = font({ bold: true, size: 13 });
  t1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("C2:L2");
  const t2 = ws.getCell("C2");
  t2.value =
    data.sortBy === "frekuensi"
      ? "Urut: ATM/Jaringan Paling Bermasalah (frekuensi gangguan terbanyak)"
      : "Urut: SLA Terendah";
  t2.font = font({ size: 10, italic: true });
  t2.alignment = { horizontal: "center", vertical: "middle" };

  // Periode + kategori (baris 4 & 5, kiri).
  ws.mergeCells("A4:F4");
  const periode = ws.getCell("A4");
  periode.value = `Periode: ${data.periodeLabel}`;
  periode.font = font({ bold: true, size: 10 });
  periode.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells("A5:F5");
  const kat = ws.getCell("A5");
  kat.value = `Kategori: ${data.kategoriLabel}`;
  kat.font = font({ bold: true, size: 10 });
  kat.alignment = { horizontal: "left", vertical: "middle" };

  // Catatan highlight (kanan, sejajar periode) agar pembaca paham warna merah.
  ws.mergeCells("G4:M5");
  const legend = ws.getCell("G4");
  legend.value =
    "Keterangan: baris ber-latar merah muda = prioritas sorotan/eskalasi ke vendor.";
  legend.font = font({ size: 9, italic: true, color: { argb: "FFB91C1C" } });
  legend.alignment = { horizontal: "right", vertical: "middle", wrapText: true };

  // ------------------- Header tabel (baris 7) -------------------
  const HDR_ROW = 7;
  for (const [col, label] of HEADERS) {
    const cell = ws.getCell(`${col}${HDR_ROW}`);
    cell.value = label;
    cell.font = font({ bold: true, size: 9 });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, HEADER_FILL);
    box(cell);
  }
  ws.getRow(HDR_ROW).height = 30;
  ws.views = [{ state: "frozen", ySplit: HDR_ROW }];

  // ------------------- Baris data (mulai 8) -------------------
  let r = HDR_ROW + 1;

  if (data.items.length === 0) {
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const empty = ws.getCell(`A${r}`);
    empty.value = "Tidak ada data permasalahan pada rentang & kategori ini.";
    empty.font = font({ italic: true, size: 10, color: { argb: "FF888888" } });
    empty.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= 13; c++) box(ws.getCell(r, c));
    r++;
  }

  data.items.forEach((it, idx) => {
    const highlight = idx < HIGHLIGHT_TOP;
    const values: Record<string, string | number> = {
      A: idx + 1,
      B: it.kodeAtm,
      C: it.namaAtm === "-" ? it.lokasi : `${it.namaAtm}${it.lokasi && it.lokasi !== "-" ? `\n${it.lokasi}` : ""}`,
      D: it.cabang,
      E: it.vendorAtm,
      F: it.vendorJaringan,
      G: kategoriText(it.kategori),
      H: it.jumlahGangguan,
      I: it.jenisGangguanTersering,
      J: it.sumberPenyebabTersering,
      K: it.totalDowntimeLabel,
      L: it.slaPersen,
      M: "", // kolom catatan tindak lanjut — sengaja kosong untuk ditulis manual
    };

    for (const [col, val] of Object.entries(values)) {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      cell.font = font({ size: 9, bold: col === "B" });
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: LEFT_COLS.has(col) ? "left" : "center",
      };
      box(cell);
      if (col === "L") cell.numFmt = "0.00%";
      fill(cell, highlight ? HIGHLIGHT_FILL : idx % 2 === 1 ? STRIPE_FILL : "FFFFFFFF");
    }
    ws.getRow(r).height = 26;
    r++;
  });

  // ------------------- Bagian bawah: catatan + tanggal cetak -------------------
  r += 1;
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const noteHead = ws.getCell(`A${r}`);
  noteHead.value = "Catatan / Tindak Lanjut ke Vendor:";
  noteHead.font = font({ bold: true, size: 10 });
  noteHead.alignment = { horizontal: "left", vertical: "middle" };
  r++;

  // Tiga baris kosong berbingkai untuk ditulis tindak lanjut.
  const noteStart = r;
  for (let i = 0; i < 3; i++) {
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    for (let c = 1; c <= 13; c++) box(ws.getCell(r, c));
    ws.getRow(r).height = 20;
    r++;
  }
  void noteStart;

  r += 1;
  ws.mergeCells(`A${r}:F${r}`);
  const cetak = ws.getCell(`A${r}`);
  cetak.value = `Tanggal cetak laporan: ${fmtCetak(new Date())}`;
  cetak.font = font({ size: 9, italic: true });
  cetak.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells(`I${r}:M${r}`);
  const total = ws.getCell(`I${r}`);
  total.value = `Total ATM/lokasi: ${data.items.length}`;
  total.font = font({ size: 9, italic: true });
  total.alignment = { horizontal: "right", vertical: "middle" };

  ws.pageSetup.printArea = `A1:${LAST_COL}${r}`;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
