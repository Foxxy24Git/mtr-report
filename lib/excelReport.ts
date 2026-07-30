// Generator laporan harian Form OPS-001 (PRD §4.D, §5, §7).
//
// Membangun workbook ExcelJS sel-per-sel agar hasil .xlsx IDENTIK dengan
// template Excel existing (lihat spesifikasi format pada PRD §5 / catatan
// analisis template asli): font, lebar kolom, merge cell, warna header,
// alignment, dan blok tanda tangan dibuat persis. Fungsi ini murni: menerima
// ReportData (tanpa I/O DB) agar bisa dipakai API route & skrip contoh.

import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TZ = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

// Font global template: "Swis721 Lt BT" (fallback Arial otomatis oleh Excel
// bila font tidak terpasang di server/klien). Warna teks default hitam.
const FONT = "Swis721 Lt BT";
const BLACK = "FF000000";
// Biru muda header tabel (sesuai template).
const HEADER_FILL = "FF83CAFF";

// ----------------------------- Tipe data laporan -----------------------------

export interface ReportActivity {
  waktu: Date;
  teks: string;
  isTindakLanjut: boolean;
}

export interface ReportTicket {
  no: number;
  waktuKejadian: Date; // C
  unitKerja: string; // D
  waktuRespon: string; // E (boleh "-")
  contactPerson: string; // F
  jenisGangguan: string; // G
  sumberPenyebab: string; // H
  metodePenanganan: string; // I
  vendor: string; // J
  activities: ReportActivity[]; // K (waktu) & L (kegiatan)
  noTiketVendor: string; // M
  waktuSelesai: Date | null; // N (null = masih proses)
  keterangan: string; // S
}

export interface ReportAcCheck {
  urutan: number;
  waktu: Date | null;
  room: string;
  panel: string;
  kiri: boolean;
  kanan: boolean;
  p12kiri: string;
  p12kanan: string;
}

export interface ReportServer {
  label: string;
  awal: string;
  akhir: string;
}

export interface ReportSignatures {
  penyerah: string;
  /** Path TTD digital petugas penyerah relatif /public (null = belum upload). */
  penyerahTtdPath: string | null;
  penerima: string;
  /** Path TTD digital petugas penerima relatif /public (null = belum upload). */
  penerimaTtdPath: string | null;
  supervisi: string;
  /** True bila supervisi sudah approve tiket → TTD supervisi boleh muncul. */
  supervisiApproved: boolean;
  /** Path file TTD digital supervisi relatif terhadap /public (mis. "/ttd/x.png"). */
  supervisiTtdPath: string | null;
  pimpinanInfra: string;
  pimpinanDivisi: string;
}

export interface ReportData {
  hariTgl: string; // "Selasa, 27 Mei 2026"
  tanggalLabel: string; // "27 Mei 2026" (untuk "Padang, …")
  namaPetugas: string;
  shiftLabel: string; // "Shift Pagi (07:00–15:00)"
  jumlahHari: number; // hari dalam bulan (untuk Total Menit)
  tickets: ReportTicket[];
  acChecks: ReportAcCheck[];
  servers: ReportServer[];
  signatures: ReportSignatures;
  /**
   * Path filesystem absolut logo (PNG/JPG) untuk pojok kiri atas. Bila tidak
   * diisi, dipakai logo bawaan public/logo-bank-nagari.png. SVG tidak didukung
   * ExcelJS — pemanggil sudah me-resolve fallback (lihat lib/appSettings.ts).
   */
  logoPath?: string;
}

// ----------------------------- Util waktu -----------------------------

/** Serial Excel dari sebuah instant, ditampilkan sebagai jam dinding WIB. */
function excelSerialWIB(d: Date): number {
  const wibMs = d.getTime() + WIB_OFFSET_MS;
  return (wibMs - EXCEL_EPOCH_UTC) / 86400000;
}

/** "14:05" (24 jam, WIB). */
function fmtJamWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

/** "03:00 PM" (12 jam, WIB) — format kolom C/N pada template. */
function fmtJam12WIB(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  }).format(d);
}

/** "30-04-2026" (WIB) — baris kedua sel waktu kejadian/selesai. */
function fmtTanggalDMY(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  })
    .format(d)
    .replace(/\//g, "-");
}

/** Sel waktu kejadian/selesai 2 baris: "03:00 PM\n30-04-2026". */
function fmtWaktuTanggal(d: Date): string {
  return `${fmtJam12WIB(d)}\n${fmtTanggalDMY(d)}`;
}

// ----------------------------- Helper styling -----------------------------

const THIN = { style: "thin" as const, color: { argb: BLACK } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** Buat objek font template (selalu memakai nama font & warna hitam). */
function font(opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return { name: FONT, color: { argb: BLACK }, ...opts };
}

function box(cell: ExcelJS.Cell) {
  cell.border = ALL_BORDERS;
}

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Terapkan border tipis ke seluruh sel pada rentang "A1:C3". */
function borderRange(ws: ExcelJS.Worksheet, range: string) {
  const [a, b] = range.split(":");
  const start = ws.getCell(a);
  const end = ws.getCell(b);
  for (let row = Number(start.row); row <= Number(end.row); row++) {
    for (let col = Number(start.col); col <= Number(end.col); col++) {
      box(ws.getCell(row, col));
    }
  }
}

// ----------------------------- Generator -----------------------------

// Lebar kolom persis template (satuan width Excel) — PRD §5 spec.
const COL_WIDTHS: Record<string, number> = {
  A: 2.86, B: 4.29, C: 14.14, D: 17.57, E: 13.86, F: 13.0, G: 13.1,
  H: 12.29, I: 14.29, J: 14.29, K: 10.43, L: 35.43, M: 16.71, N: 11.26,
  O: 13.52, P: 14.1, Q: 12.57, R: 14.43, S: 14.43,
};

// Ukuran gambar TTD digital di blok tanda tangan (px). Diperbesar agar jelas
// terlihat; dipusatkan horizontal via lebar kolom (lihat blok tanda tangan).
const TTD_W = 130;
const TTD_H = 56;

/** Teks penanda entri tindak lanjut (dicetak bold di kolom L). */
const TINDAK_LANJUT_TEKS = "TINDAK LANJUT MONITORING SELANJUTNYA";

/**
 * Lebar 1 satuan lebar kolom Excel dalam px (Max Digit Width font default).
 * Kolom lebar `w` → area teks ≈ w × 7px (angka +5px pada rumus Microsoft ITU
 * padding selnya, jadi tidak dikurangi dua kali).
 */
const PX_PER_COL_UNIT = 7;

/**
 * Lebar 1 satuan bobot CHAR_WEIGHTS dalam px pada Arial 9pt = 5.608px (angka
 * '0' = 0.5562em → 6.674px dibagi bobot 1.19; diukur dari advance width
 * Arial.ttf, model bobotnya terbukti akurat ±0.35px per baris).
 */
const PX_PER_WEIGHT_UNIT = 5.608;

/**
 * Kapasitas satu baris visual sebuah kolom dalam satuan bobot CHAR_WEIGHTS,
 * dengan margin aman 4% supaya perkiraan tinggi baris cenderung SEDIKIT
 * berlebih (baris agak longgar) ketimbang kurang (teks terpotong).
 */
function lineCapacity(colWidth: number): number {
  return ((colWidth * PX_PER_COL_UNIT) / PX_PER_WEIGHT_UNIT) * 0.96;
}

/**
 * Kapasitas baris kolom L — dipakai HANYA untuk memperkirakan tinggi baris,
 * BUKAN untuk memotong teks. Sejak layout satu-baris-Excel-per-entri (lihat
 * komentar besar di blok baris data tiket), teks kegiatan ditulis UTUH ke
 * selnya dan dibiarkan di-wrap sendiri oleh Excel pada lebar kolom
 * sungguhannya — jadi teks mengisi kolom penuh, tak ada lagi margin aman yang
 * terbuang (dulu ~15%) dan tak ada lagi kalimat yang pecah pendek-pendek.
 * Kalau angka ini sedikit meleset, akibatnya cuma tinggi baris agak
 * longgar/rapat — TIDAK pernah merusak kesejajaran jam vs kegiatan, karena
 * keduanya kini berada di baris Excel yang SAMA.
 */
const L_CHARS_PER_LINE = lineCapacity(COL_WIDTHS.L);

/** Batas tinggi baris Excel ≈ 409pt; sisakan margin kecil. */
const MAX_ROW_HEIGHT = 400;

/** Tinggi baris (pt) per baris visual pada font 9pt. */
const BASE_LINE_PT = 14;

/** Padding vertikal sel (pt) di luar baris teks. */
const ROW_PAD_PT = 6;

/**
 * Tinggi baris (pt) yang dibutuhkan sebuah teks pada kolom selebar
 * `charsPerLine` satuan bobot. Dibatasi MAX_ROW_HEIGHT (batas keras Excel).
 */
function heightFor(text: string, charsPerLine: number, minLines = 1): number {
  const lines = Math.max(wrapLines(text, charsPerLine).length, minLines);
  return Math.min(lines * BASE_LINE_PT + ROW_PAD_PT, MAX_ROW_HEIGHT);
}

/**
 * Bobot lebar relatif tiap karakter untuk font proporsional (Arial — fallback
 * "Swis721 Lt BT" di server/klien tanpa font itu terpasang), dinormalisasi
 * supaya rata-rata karakter pada teks log gangguan sehari-hari ≈ 1.0
 * (dikalibrasi dari corpus contoh nyata via pengukuran advance-width
 * Arial.ttf). Karakter sempit (i, l, spasi, titik) < 1; karakter lebar (m, w,
 * huruf besar) > 1 — bedanya bisa ~3-4x. Tanpa bobot ini, `wrapLines`
 * menyamaratakan "iiiii" dengan "mmmmm" padahal lebar render-nya jauh beda,
 * yang jadi biang drift K vs L pada teks yang didominasi huruf sempit
 * ("informasikan", "koordinasikan", "dilokasi", dst — umum di log gangguan).
 *
 * Kembar persis dengan tabel senama di lib/excelReportLengkap.ts.
 */
const CHAR_WEIGHTS: Record<string, number> = {
  i: 0.47, j: 0.47, l: 0.47, "'": 0.41,
  f: 0.6, t: 0.6, I: 0.6, " ": 0.6, ".": 0.6, ",": 0.6, ";": 0.6, ":": 0.6, "!": 0.6, "/": 0.6,
  r: 0.72, "-": 0.72, "(": 0.72, ")": 0.72, '"': 0.76,
  c: 1.07, k: 1.07, s: 1.07, v: 1.07, x: 1.07, y: 1.07, z: 1.07, J: 1.07,
  a: 1.19, b: 1.19, d: 1.19, e: 1.19, g: 1.19, h: 1.19, n: 1.19, o: 1.19, p: 1.19, q: 1.19, u: 1.19,
  "0": 1.19, "1": 1.19, "2": 1.19, "3": 1.19, "4": 1.19, "5": 1.19, "6": 1.19, "7": 1.19, "8": 1.19, "9": 1.19,
  "?": 1.19, L: 1.19, "_": 1.19,
  F: 1.31, T: 1.31, Z: 1.31,
  A: 1.43, B: 1.43, E: 1.43, K: 1.43, P: 1.43, S: 1.43, V: 1.43, X: 1.43, Y: 1.43, "&": 1.43,
  w: 1.54, C: 1.54, D: 1.54, H: 1.54, N: 1.54, R: 1.54, U: 1.54,
  G: 1.67, O: 1.67, Q: 1.67,
  m: 1.79, M: 1.79,
  "%": 1.91,
  W: 2.03,
  "@": 2.18,
};
/** Karakter tak dikenal (non-ASCII, dsb) dianggap lebar rata-rata. */
const DEFAULT_CHAR_WEIGHT = 1.0;
const SPACE_WEIGHT = CHAR_WEIGHTS[" "];

function weightedLength(word: string): number {
  let sum = 0;
  for (const ch of word) sum += CHAR_WEIGHTS[ch] ?? DEFAULT_CHAR_WEIGHT;
  return sum;
}

/**
 * Potong SATU paragraf teks jadi baris-baris ≤ `charsPerLine` (satuan lebar
 * berbobot, lihat CHAR_WEIGHTS) — GREEDY WORD-WRAP yang kita jalankan sendiri,
 * bukan tebakan atas apa yang Excel akan lakukan. Newline eksplisit tetap
 * dihitung sebagai pemisah paragraf terpisah. Kata tunggal yang lebih lebar
 * dari kolom dipotong paksa di tengah (Excel juga begitu).
 *
 * Hasil array ini dipakai LANGSUNG sebagai baris kolom L (bukan cuma
 * dihitung jumlahnya) — kolom K di-padding mengikuti panjang array ini persis,
 * jadi jumlah baris K dan L per entri PASTI sama (dijamin oleh konstruksi,
 * bukan lagi soal tebakan meleset atau tidak).
 *
 * Sengaja diimplementasikan lokal (kembar dengan helper senama di
 * lib/excelReportLengkap.ts) supaya generator laporan harian ini tetap berdiri
 * sendiri, tidak bergantung pada modul rekap lengkap. Test unit-nya ada di
 * lib/__tests__/excelWrapLines.test.ts (menguji kembarannya yang ter-export).
 */
function wrapLines(text: string, charsPerLine: number): string[] {
  if (!text) return [""];
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }

    let current = "";
    let used = 0; // lebar berbobot terpakai di `current`
    for (const word of words) {
      const w = weightedLength(word);
      if (used > 0 && used + SPACE_WEIGHT + w <= charsPerLine) {
        current += ` ${word}`;
        used += SPACE_WEIGHT + w;
        continue;
      }
      if (used > 0) {
        out.push(current);
        current = "";
        used = 0;
      }
      // `word` jadi kandidat awal baris baru; potong paksa bila sendirian pun tak muat.
      let remaining = word;
      let remW = w;
      while (remW > charsPerLine) {
        const cut = Math.max(1, Math.floor((charsPerLine / remW) * remaining.length));
        out.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
        remW = weightedLength(remaining);
      }
      current = remaining;
      used = remW;
    }
    out.push(current);
  }
  return out;
}

/** Teks kolom L satu entri kegiatan (tanpa jam — jam ada di kolom K). */
function activityText(a: ReportActivity): string {
  return a.isTindakLanjut ? TINDAK_LANJUT_TEKS : a.teks;
}

export async function buildReportWorkbook(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "mtr-Report";
  wb.created = new Date();

  const ws = wb.addWorksheet("Laporan", {
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
  ws.properties.defaultColWidth = 10;

  // ------------------- Logo Bank Nagari (pojok kiri atas A1:B3) -------------------
  // Judul berada di B2:R2 (teks di-center jauh dari kolom A), jadi logo kecil di
  // kolom A–B baris 1–3 tidak menutupi teks judul.
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  // Logo: pakai logo aplikasi yang di-resolve pemanggil (logoPath), jatuh ke
  // logo bawaan bila tidak diisi. Hanya PNG/JPG (ExcelJS tak mendukung SVG).
  const logoPath =
    data.logoPath ?? join(process.cwd(), "public", "logo-bank-nagari.png");
  if (existsSync(logoPath)) {
    const lower = logoPath.toLowerCase();
    const extension = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
    const imgId = wb.addImage({
      buffer: readFileSync(logoPath) as unknown as ArrayBuffer,
      extension,
    });
    ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 84, height: 52 } });
  }

  // ------------------- Header judul -------------------
  ws.mergeCells("B2:R2");
  const t1 = ws.getCell("B2");
  t1.value = "LAPORAN HARIAN PENANGANAN GANGGUAN";
  t1.font = font({ bold: true, size: 10 });
  t1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("B3:R3");
  const t2 = ws.getCell("B3");
  t2.value = "SISTEM ATM DAN JARINGAN KOMUNIKASI";
  t2.font = font({ bold: true, size: 10 });
  t2.alignment = { horizontal: "center", vertical: "middle" };

  const form = ws.getCell("S3");
  form.value = "FORM OPS-001";
  form.font = font({ bold: true, size: 10 });
  form.alignment = { horizontal: "center", vertical: "middle" };

  // ------------------- Info petugas (kiri, baris 8–10) -------------------
  const info: [number, string, string][] = [
    [8, "Hari / Tgl :", data.hariTgl],
    [9, "Nama Petugas :", data.namaPetugas],
    [10, "Waktu Shift :", data.shiftLabel],
  ];
  for (const [row, label, value] of info) {
    ws.mergeCells(`B${row}:C${row}`);
    const l = ws.getCell(`B${row}`);
    l.value = label;
    l.font = font({ size: 10 });
    l.alignment = { horizontal: "left", vertical: "middle" };
    const v = ws.getCell(`D${row}`);
    v.value = value;
    v.font = font({ size: 10 });
    v.alignment = { horizontal: "left", vertical: "middle" };
  }

  // ------------------- Blok Log Server (G5:I10 awal, K5:L10 akhir) -------------------
  // G5:I5 = header pemeriksaan awal, K5:L5 = header pemeriksaan akhir.
  // Baris 6–10: kolom G = nama server, H:I = status awal, K:L = status akhir.
  ws.mergeCells("G5:I5");
  ws.mergeCells("K5:L5");
  const svHead: [string, string][] = [
    ["G5", "Pemeriksaan Awal Monitoring"],
    ["K5", "Pemeriksaan Akhir Monitoring"],
  ];
  for (const [addr, label] of svHead) {
    const cell = ws.getCell(addr);
    cell.value = label;
    cell.font = font({ bold: true, size: 9 });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, HEADER_FILL);
  }
  data.servers.slice(0, 5).forEach((s, i) => {
    const row = 6 + i;
    ws.mergeCells(`H${row}:I${row}`);
    ws.mergeCells(`K${row}:L${row}`);
    const name = ws.getCell(`G${row}`);
    name.value = s.label;
    name.font = font({ bold: true, size: 9 });
    name.alignment = { horizontal: "left", vertical: "middle" };
    const awal = ws.getCell(`H${row}`);
    awal.value = s.awal || "-";
    awal.font = font({ size: 9 });
    awal.alignment = { horizontal: "center", vertical: "middle" };
    const akhir = ws.getCell(`K${row}`);
    akhir.value = s.akhir || "-";
    akhir.font = font({ size: 9 });
    akhir.alignment = { horizontal: "center", vertical: "middle" };
  });
  borderRange(ws, "G5:L10");

  // ------------------- Blok Suhu AC (N5:R9) -------------------
  // O5 = "Waktu Pemantauan :", P5/Q5/R5 = 3 jam pemantauan.
  // Baris 6–9: label (N:O di-merge) + nilai pemantauan 1/2/3 di P/Q/R.
  const acSorted = [1, 2, 3].map((u) => data.acChecks.find((a) => a.urutan === u) ?? null);
  const o5 = ws.getCell("O5");
  o5.value = "Waktu Pemantauan :";
  o5.font = font({ bold: true, size: 9 });
  o5.alignment = { horizontal: "right", vertical: "middle" };
  ["P", "Q", "R"].forEach((col, i) => {
    const cell = ws.getCell(`${col}5`);
    const chk = acSorted[i];
    if (chk?.waktu) {
      cell.value = excelSerialWIB(chk.waktu);
      cell.numFmt = "h:mm";
    } else {
      cell.value = "-";
    }
    cell.font = font({ size: 9 });
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const acRows: [number, string, (c: ReportAcCheck) => string][] = [
    [6, "Suhu Room Server", (c) => c.room || "-"],
    [7, "Suhu Ruangan Panel", (c) => c.panel || "-"],
    [8, "Status Aktif AC (Ki/Ka)", (c) => `${c.kiri ? "Aktif" : "Mati"} / ${c.kanan ? "Aktif" : "Mati"}`],
    [9, "Pemantauan Berkala 12 Jam (Ki/Ka)", (c) => `${c.p12kiri || "-"} / ${c.p12kanan || "-"}`],
  ];
  for (const [row, label, getter] of acRows) {
    ws.mergeCells(`N${row}:O${row}`);
    const l = ws.getCell(`N${row}`);
    l.value = label;
    l.font = font({ bold: true, size: 9 });
    l.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    ["P", "Q", "R"].forEach((col, i) => {
      const chk = acSorted[i];
      const cell = ws.getCell(`${col}${row}`);
      cell.value = chk ? getter(chk) : "-";
      cell.font = font({ size: 9 });
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  }
  borderRange(ws, "N5:R9");

  // ------------------- Total Menit dalam Bulan (O10/S10) -------------------
  const bulan = (data.tanggalLabel.split(" ")[1] ?? "").trim();
  ws.mergeCells("O10:R10");
  const tmLabel = ws.getCell("O10");
  tmLabel.value = `Total Menit dalam Bulan ${bulan} =`;
  tmLabel.font = font({ bold: true, size: 9 });
  tmLabel.alignment = { horizontal: "right", vertical: "middle" };
  const tmVal = ws.getCell("S10");
  tmVal.value = { formula: `24*60*${data.jumlahHari}` };
  tmVal.numFmt = "#,##0";
  tmVal.font = font({ bold: true, size: 9 });
  tmVal.alignment = { horizontal: "center", vertical: "middle" };
  box(tmVal);

  // ------------------- Header tabel tiket (baris 12–13) -------------------
  // Semua kolom merge vertikal X12:X13 KECUALI K & L. K12:L12 gabungan,
  // lalu K13="Waktu", L13="Kegiatan". Fill biru muda, bold, border, wrap.
  const HEADERS: [string, string][] = [
    ["B", "No"],
    ["C", "Waktu Kejadian Gangguan"],
    ["D", "Unit Kerja/tempat kejadian Gangguan"],
    ["E", "Waktu Respon Penanganan Internal"],
    ["F", "Contact Person"],
    ["G", "Jenis Gangguan"],
    ["H", "Sumber Penyebab Gangguan"],
    ["I", "Metode Penanganan Gangguan"],
    ["J", "Vendor jaringan/ATM"],
    ["M", "No Tiket Aduan dari Vendor"],
    ["N", "Waktu selesai Gangguan"],
    ["O", "Lama peyelesaian gangguan\n(hh:mm)"],
    ["P", "Lama peyelesaian gangguan\n(Menit)"],
    ["Q", "Total waktu dalam 1 Bulan (Menit)"],
    ["R", "SLA (%) /  otomatis"],
    ["S", "Keterangan"],
  ];
  for (const [col, label] of HEADERS) {
    ws.mergeCells(`${col}12:${col}13`);
    const cell = ws.getCell(`${col}12`);
    cell.value = label;
    cell.font = font({ bold: true, size: 9 });
    // D rata kiri+middle, sisanya center+middle.
    cell.alignment = {
      horizontal: col === "D" ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    };
    fill(cell, HEADER_FILL);
  }
  // Grup "Uraian Kegiatan Penanganan gangguan" (K12:L12) + sub Waktu/Kegiatan.
  ws.mergeCells("K12:L12");
  const uk = ws.getCell("K12");
  uk.value = "Uraian Kegiatan Penanganan gangguan";
  uk.font = font({ bold: true, size: 9 });
  uk.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  fill(uk, HEADER_FILL);
  for (const [col, label] of [["K", "Waktu"], ["L", "Kegiatan"]] as const) {
    const cell = ws.getCell(`${col}13`);
    cell.value = label;
    cell.font = font({ bold: true, size: 9 });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, HEADER_FILL);
  }
  borderRange(ws, "B12:S13");
  ws.getRow(12).height = 28;
  ws.getRow(13).height = 36;

  // ------------------- Baris data tiket (mulai 14) -------------------
  // Kolom rata kiri (D=lokasi, S=keterangan); sisanya center. Kolom L
  // (kegiatan) dirata kanan-kiri lewat JUSTIFY_COLS.
  // E–J center+top sesuai §7 (Waktu Respon, Contact Person, Jenis/Sumber/
  // Metode gangguan, Vendor). Semua sel data wrap=true, vertical top.
  const LEFT_COLS = new Set(["D", "S"]);
  const JUSTIFY_COLS = new Set(["L"]);
  // Kolom yang nilainya milik TIKET (satu nilai untuk semua entri kegiatan) →
  // di-merge vertikal sepanjang blok. K & L tidak termasuk: itu per-entri, satu
  // baris Excel masing-masing. N–R diurus terpisah (bentuk merge-nya beda
  // antara tiket selesai vs masih proses).
  const TICKET_COLS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "M", "S"];
  const totalMenit = 24 * 60 * data.jumlahHari;

  let r = 14;
  if (data.tickets.length === 0) {
    ws.mergeCells(`B${r}:S${r}`);
    const empty = ws.getCell(`B${r}`);
    empty.value = "Tidak ada tiket gangguan pada shift ini.";
    empty.font = font({ italic: true, size: 10, color: { argb: "FF888888" } });
    empty.alignment = { horizontal: "center", vertical: "middle" };
    borderRange(ws, `B${r}:S${r}`);
    r++;
  }

  for (const t of data.tickets) {
    // SATU BARIS EXCEL PER ENTRI KEGIATAN.
    //
    // Dulu semua kegiatan satu tiket dijejalkan ke SATU baris Excel: kolom L
    // diisi paragraf-paragraf yang kita potong sendiri, kolom K dipadding baris
    // kosong supaya jamnya jatuh sebaris dengan awal kegiatannya. Cara itu
    // memaksa kita memotong teks pada lebar "aman" (~15% lebih sempit dari
    // kolom) agar Excel/WPS tidak mem-wrap ULANG potongan kita — akibatnya
    // kalimat pecah pendek-pendek, tepi kanan kolom menganggur, dan tabel
    // terlihat berantakan. Juga kena batas keras tinggi baris Excel (±409pt):
    // tiket dengan belasan kegiatan terpotong tanpa peringatan.
    //
    // Sekarang tiap entri dapat BARIS EXCEL-nya sendiri: jam (K) dan
    // kegiatannya (L) duduk di baris yang sama, jadi sejajar SECARA STRUKTURAL
    // — tanpa estimasi wrap sama sekali. Efek sampingnya semuanya positif:
    // teks kegiatan boleh ditulis UTUH dan dibiarkan Excel mem-wrap pada lebar
    // kolom sungguhannya (kolom terisi penuh, bisa rata kanan-kiri), dan batas
    // 409pt tak lagi relevan karena satu baris cuma memuat satu kegiatan.
    // Kolom milik TIKET (bukan per-entri) di-merge vertikal sepanjang blok.
    const activities = t.activities;
    const rowCount = Math.max(activities.length, 1);
    const firstRow = r;
    const lastRow = r + rowCount - 1;
    const keteranganText = t.waktuSelesai
      ? "Selesai"
      : "Monitoring Dilanjutkan oleh Shift berikutnya";

    ws.getCell(`B${firstRow}`).value = t.no;
    ws.getCell(`C${firstRow}`).value = fmtWaktuTanggal(t.waktuKejadian);
    ws.getCell(`D${firstRow}`).value = t.unitKerja;
    ws.getCell(`E${firstRow}`).value = t.waktuRespon || "-";
    ws.getCell(`F${firstRow}`).value = t.contactPerson || "-";
    ws.getCell(`G${firstRow}`).value = t.jenisGangguan || "-";
    ws.getCell(`H${firstRow}`).value = t.sumberPenyebab || "-";
    ws.getCell(`I${firstRow}`).value = t.metodePenanganan || "-";
    ws.getCell(`J${firstRow}`).value = t.vendor || "-";
    ws.getCell(`M${firstRow}`).value = t.noTiketVendor || "-";
    // Kolom Keterangan (S): tiket close = "Selesai"; tiket masih proses =
    // "Monitoring Dilanjutkan oleh Shift berikutnya" (waktuSelesai null = proses).
    ws.getCell(`S${firstRow}`).value = keteranganText;

    for (const col of TICKET_COLS) {
      if (rowCount > 1) ws.mergeCells(`${col}${firstRow}:${col}${lastRow}`);
    }

    if (t.waktuSelesai) {
      ws.getCell(`N${firstRow}`).value = fmtWaktuTanggal(t.waktuSelesai);
      const durDays = excelSerialWIB(t.waktuSelesai) - excelSerialWIB(t.waktuKejadian);
      const menit = Math.round(durDays * 24 * 60);
      const o = ws.getCell(`O${firstRow}`);
      o.value = durDays;
      o.numFmt = "[h]:mm";
      const p = ws.getCell(`P${firstRow}`);
      p.value = menit;
      p.numFmt = "#,##0";
      const q = ws.getCell(`Q${firstRow}`);
      q.value = totalMenit - menit;
      q.numFmt = "#,##0";
      const sla = ws.getCell(`R${firstRow}`);
      sla.value = (totalMenit - menit) / totalMenit;
      sla.numFmt = "0.00%";
      if (rowCount > 1) {
        for (const col of ["N", "O", "P", "Q", "R"]) {
          ws.mergeCells(`${col}${firstRow}:${col}${lastRow}`);
        }
      }
    } else {
      // Tiket masih proses (PRD §5): N:P di-merge "Dalam Proses";
      // Q:R di-merge "Monitoring Dilanjutkan oleh Shift berikutnya".
      // Kini merge-nya jadi blok (ikut setinggi seluruh baris entri tiket ini).
      ws.mergeCells(`N${firstRow}:P${lastRow}`);
      ws.getCell(`N${firstRow}`).value = "Dalam Proses";
      ws.mergeCells(`Q${firstRow}:R${lastRow}`);
      ws.getCell(`Q${firstRow}`).value = "Monitoring Dilanjutkan oleh Shift berikutnya";
    }

    // K = jam entri, L = teks kegiatannya UTUH (di-wrap Excel sendiri).
    // Tindak lanjut dicetak bold via richText satu run.
    let blockPt = 0;
    if (activities.length === 0) {
      ws.getCell(`K${firstRow}`).value = "-";
      ws.getCell(`L${firstRow}`).value = "-";
    } else {
      activities.forEach((a, idx) => {
        const rr = firstRow + idx;
        const teks = activityText(a);
        ws.getCell(`K${rr}`).value = fmtJamWIB(a.waktu);
        ws.getCell(`L${rr}`).value = a.isTindakLanjut
          ? { richText: [{ text: teks, font: font({ size: 9, bold: true }) }] }
          : teks;
        const h = heightFor(teks, L_CHARS_PER_LINE);
        ws.getRow(rr).height = h;
        blockPt += h;
      });
    }

    // Tinggi total blok harus cukup juga untuk kolom milik tiket yang di-merge
    // (Excel TIDAK auto-fit sel ter-merge): lokasi, keterangan, dan kolom C
    // yang selalu 2 baris (jam + tanggal). Kekurangannya ditambahkan ke baris
    // terakhir blok supaya jam/kegiatan di atasnya tetap rapat.
    const ticketPt = Math.max(
      heightFor(t.unitKerja, lineCapacity(COL_WIDTHS.D)),
      heightFor(keteranganText, lineCapacity(COL_WIDTHS.S)),
      2 * BASE_LINE_PT + ROW_PAD_PT
    );
    if (blockPt < ticketPt) {
      const lastH = Number(ws.getRow(lastRow).height ?? 0);
      ws.getRow(lastRow).height = Math.min(lastH + (ticketPt - blockPt), MAX_ROW_HEIGHT);
    }

    // Styling seluruh blok (border + font + alignment + wrap).
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = 2; col <= 19; col++) {
        const cell = ws.getCell(row, col);
        // Border: pemisah kolom (kiri/kanan) selalu ada, tapi garis HORIZONTAL
        // hanya di tepi ATAS & BAWAH blok tiket. Antar entri kegiatan dalam
        // satu tiket sengaja TANPA garis supaya satu tiket terbaca sebagai satu
        // kesatuan, tidak terkotak-kotak per entri.
        cell.border = {
          left: THIN,
          right: THIN,
          ...(row === firstRow ? { top: THIN } : {}),
          ...(row === lastRow ? { bottom: THIN } : {}),
        };
        const existing = (cell.font ?? {}) as Partial<ExcelJS.Font>;
        const letter = cell.address.replace(/\d+/g, "");
        cell.font = font({ size: 9, bold: existing.bold });
        cell.alignment = {
          vertical: "top",
          wrapText: true,
          // Kolom kegiatan rata kanan-kiri (justify) supaya teks mengisi kolom
          // penuh & tepi kanannya rapi. Ini baru mungkin sejak teks tidak lagi
          // kita potong sendiri: Excel hanya me-justify baris yang IA sendiri
          // wrap, bukan baris yang sudah dipisah "\n" eksplisit.
          horizontal: JUSTIFY_COLS.has(letter)
            ? "justify"
            : LEFT_COLS.has(letter)
              ? "left"
              : "center",
        };
      }
    }
    r = lastRow + 1;
  }

  // ------------------- Blok tanda tangan (baris 25–31) -------------------
  // Posisi kanonik template = baris 25; bila data lebih panjang, geser ke bawah
  // dengan offset relatif yang sama (label +1, area TTD +1..+3, nama +6).
  const sigStart = Math.max(25, r + 1);
  const titleRow = sigStart + 1; // 26
  const ttdTop = sigStart + 2; // 27 (area tempel TTD, merge label 26:28)
  const nameRow = sigStart + 6; // 31

  ws.mergeCells(`B${sigStart}:S${sigStart}`);
  const padang = ws.getCell(`B${sigStart}`);
  padang.value = `Padang, ${data.tanggalLabel}`;
  padang.font = font({ size: 10 });
  padang.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  const sig = data.signatures;
  // Kolom blok TTD: penyerah C:D, penerima F:G, supervisi I:J, infra O:P, divisi R:S.
  const blocks: {
    c1: string;
    c2: string;
    imgCol: number;
    title: string;
    nama: string;
    ttdPath: string | null;
    /** True = petugas/supervisi (punya TTD digital → tampilkan gambar/placeholder). */
    signer: boolean;
    show: boolean;
  }[] = [
    { c1: "C", c2: "D", imgCol: 2, title: "Petugas Monitoring yang menyerahkan", nama: sig.penyerah, ttdPath: sig.penyerahTtdPath, signer: true, show: true },
    { c1: "F", c2: "G", imgCol: 5, title: "Petugas Monitoring yang Menerima", nama: sig.penerima, ttdPath: sig.penerimaTtdPath, signer: true, show: true },
    { c1: "I", c2: "J", imgCol: 8, title: "Supervisi", nama: sig.supervisi, ttdPath: sig.supervisiTtdPath, signer: true, show: sig.supervisiApproved },
    { c1: "O", c2: "P", imgCol: 14, title: "Mengetahui,\nBag. Infrastruktur TI", nama: sig.pimpinanInfra, ttdPath: null, signer: false, show: true },
    { c1: "R", c2: "S", imgCol: 17, title: "Mengetahui,\nPemimpin Divisi", nama: sig.pimpinanDivisi, ttdPath: null, signer: false, show: true },
  ];

  for (let row = titleRow; row <= titleRow + 2; row++) ws.getRow(row).height = 20;
  ws.getRow(nameRow).height = 31;

  for (const b of blocks) {
    // Label jabatan (merge X26:Y28) — teks di atas, area TTD di tengah.
    ws.mergeCells(`${b.c1}${titleRow}:${b.c2}${titleRow + 2}`);
    const label = ws.getCell(`${b.c1}${titleRow}`);
    label.value = b.title;
    label.font = font({ size: 10 });
    label.alignment = { horizontal: "center", vertical: "top", wrapText: true };

    // Nama dalam kurung (merge X31:Y31).
    ws.mergeCells(`${b.c1}${nameRow}:${b.c2}${nameRow}`);
    const name = ws.getCell(`${b.c1}${nameRow}`);
    name.value = `( ${b.nama || "…………………………"} )`;
    name.font = font({ size: 10 });
    name.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // TTD digital ditempel sebagai gambar melayang di atas area label (baris
    // 27–28). Petugas penyerah/penerima selalu muncul; supervisi hanya setelah
    // approve. Tanpa gambar, area di bawah label dibiarkan kosong (ruang TTD
    // manual) — tidak ditulisi teks agar tidak menimpa label di sel merge.
    if (b.show && b.signer && b.ttdPath) {
      const ttdAbs = join(process.cwd(), "public", b.ttdPath.replace(/^\//, ""));
      const low = b.ttdPath.toLowerCase();
      const ext = low.endsWith(".jpg") || low.endsWith(".jpeg") ? "jpeg" : "png";
      if (existsSync(ttdAbs)) {
        const ttdId = wb.addImage({
          buffer: readFileSync(ttdAbs) as unknown as ArrayBuffer,
          extension: ext,
        });
        // Pusatkan TTD horizontal di area merge label (kolom c1:c2). ExcelJS
        // membatasi offset via pecahan kolom (cap ≈ width*10000 EMU ≪ lebar
        // render), jadi offset EMU di-set langsung lewat nativeCol/nativeColOff
        // (1 px = 9525 EMU; lebar render kolom ≈ width*7+5 px). Vertikal:
        // nativeRow baris 27 (di bawah teks label, merge 26:28).
        const EMU_PX = 9525;
        const colPx = (w: number) => Math.round(w * 7 + 5);
        const w1 = colPx(COL_WIDTHS[b.c1]);
        let leftPx = Math.max(0, (w1 + colPx(COL_WIDTHS[b.c2]) - TTD_W) / 2);
        let nativeCol = b.imgCol;
        if (leftPx > w1) {
          leftPx -= w1; // gambar mulai dari kolom kedua (c2)
          nativeCol += 1;
        }
        ws.addImage(ttdId, {
          tl: {
            nativeCol,
            nativeColOff: Math.round(leftPx * EMU_PX),
            nativeRow: ttdTop - 1,
            nativeRowOff: 0,
          },
          ext: { width: TTD_W, height: TTD_H },
        } as unknown as Parameters<typeof ws.addImage>[1]);
      }
    }
  }

  // ------------------- Print area -------------------
  ws.pageSetup.printArea = `A1:S${nameRow}`;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
