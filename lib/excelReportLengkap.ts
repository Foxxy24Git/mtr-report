// Generator "Rekap Laporan Lengkap" (Download Laporan Lengkap — Fase 3).
//
// Membangun SATU sheet .xlsx berisi SEMUA tiket gabungan (semua petugas & semua
// shift) untuk satu rentang tanggal. Format kolom mengikuti laporan harian
// (Form OPS-001, lihat lib/excelReport.ts) TAPI ditambah 3 kolom penanda di
// depan: Tanggal, Shift, Petugas. Blok tanda tangan TIDAK bersumber dari
// shift_reports (rekap gabungan), melainkan dari pilihan modal (Fase 1):
// Supervisi + Pimpinan/PJS Bag. Infrastruktur & Divisi TI.
//
// Fungsi murni: menerima LengkapReportData (tanpa I/O DB) agar bisa dipakai API
// route maupun skrip contoh. Orkestrasi DB ada di lib/reportLengkapExcelData.ts.

import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LengkapTicket } from "@/lib/reportLengkapQuery";
import { buildLengkapSummary, type LengkapSummary } from "@/lib/reportLengkapSummary";

const TZ = "Asia/Jakarta";

// Font & warna template (samakan laporan harian). Swis721 Lt BT → fallback Arial
// otomatis bila font tak terpasang.
const FONT = "Swis721 Lt BT";
const BLACK = "FF000000";
const HEADER_FILL = "FF83CAFF"; // biru muda header tabel
const STRIPE_FILL = "FFF1F5F9"; // selang-seling antar kelompok tanggal+shift

export interface LengkapSignatures {
  supervisi: string;
  /** Path TTD digital supervisi relatif /public (null = tanpa gambar). */
  supervisiTtdPath: string | null;
  /** Nama pimpinan/PJS Bag. Infrastruktur TI (sudah resolve PJS → nama_pjs). */
  pimpinanInfra: string;
  /** Nama pimpinan/PJS Pemimpin Divisi TI (sudah resolve PJS → nama_pjs). */
  pimpinanDivisi: string;
}

export interface LengkapReportData {
  /** "01 Juni 2026 s/d 07 Juni 2026". */
  periodeLabel: string;
  /** Tanggal untuk baris "Padang, …" (umumnya tanggal 'sampai'). */
  tanggalLabel: string;
  tickets: LengkapTicket[];
  signatures: LengkapSignatures;
  /** Path FS absolut logo PNG/JPG (SVG tak didukung ExcelJS). */
  logoPath?: string;
}

// ----------------------------- Util waktu -----------------------------

/** "14:05" (24 jam, WIB). */
function fmtJamWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

/** "03:00 PM" (12 jam, WIB) — baris pertama sel waktu kejadian/selesai. */
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

/** Sel waktu 2 baris: "03:00 PM\n30-04-2026". */
function fmtWaktuTanggal(d: Date): string {
  return `${fmtJam12WIB(d)}\n${fmtTanggalDMY(d)}`;
}

/** "01 Juni 2026" dari YYYY-MM-DD (WIB) — dipakai pemanggil untuk periodeLabel. */
export function fmtTanggalIndo(ymd: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(`${ymd}T00:00:00+07:00`));
}

/** "01 Juni 2026 s/d 07 Juni 2026" dari dua tanggal YYYY-MM-DD. */
export function buildPeriodeLabel(dari: string, sampai: string): string {
  return `${fmtTanggalIndo(dari)} s/d ${fmtTanggalIndo(sampai)}`;
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

// ----------------------------- Generator -----------------------------

// Kolom A–T. 3 kolom penanda (B,C,D) di depan vs laporan harian, lalu format
// kolom mengikuti Form OPS-001 (waktu/lokasi/CP/gangguan/kegiatan/SLA).
const COL_WIDTHS: Record<string, number> = {
  A: 4.0, // No
  B: 11.5, // Tanggal
  C: 12.0, // Shift
  D: 16.0, // Petugas
  E: 13.0, // Waktu Kejadian
  F: 22.0, // Unit Kerja/Lokasi ATM
  G: 12.0, // Waktu Respon Internal
  H: 13.0, // Contact Person
  I: 13.0, // Jenis Gangguan
  J: 13.0, // Sumber Penyebab
  K: 14.0, // Metode Penanganan
  L: 12.0, // Vendor
  M: 9.5, // Waktu Kegiatan
  // Uraian Kegiatan. Dilebarkan 34 → 40 supaya label "TINDAK LANJUT MONITORING
  // SELANJUTNYA" (263.6px pada Arial 9pt) muat SATU baris dengan margin aman:
  // 40 × 7px = 280px, dan tetap muat walau padding sel dihitung paling
  // pesimistis (275px). Pada lebar 34 (238px) label itu selalu pecah 2 baris
  // dan bikin tabel kelihatan tidak rapi; 38 (266px) muat tapi cuma beda 2px.
  N: 40.0, // Uraian Kegiatan
  O: 15.0, // No Tiket Vendor
  P: 12.0, // Waktu Selesai
  Q: 10.0, // Lama (hh:mm)
  R: 9.5, // Lama (Menit)
  S: 9.5, // SLA (%)
  T: 16.0, // Keterangan
};

const LAST_COL = "T";
const TTD_W = 130;
const TTD_H = 56;

/** Teks penanda entri tindak lanjut (dicetak bold di kolom N). */
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
 * Kapasitas baris kolom N — dipakai HANYA untuk memperkirakan tinggi baris,
 * BUKAN untuk memotong teks. Sejak layout satu-baris-Excel-per-entri (lihat
 * komentar besar di blok baris data), teks kegiatan ditulis UTUH ke selnya dan
 * dibiarkan di-wrap sendiri oleh Excel pada lebar kolom sungguhannya — jadi
 * teks mengisi kolom penuh, tak ada lagi margin aman yang terbuang (dulu ~15%)
 * dan tak ada lagi kalimat yang pecah pendek-pendek. Kalau angka ini sedikit
 * meleset, akibatnya cuma tinggi baris agak longgar/rapat — TIDAK pernah
 * merusak kesejajaran jam vs kegiatan, karena keduanya kini berada di baris
 * Excel yang SAMA.
 */
const N_CHARS_PER_LINE = lineCapacity(COL_WIDTHS.N);

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
 * dokumentasi "Swis721 Lt BT" di server/klien tanpa font itu terpasang),
 * dinormalisasi supaya rata-rata karakter pada teks log gangguan sehari-hari
 * ≈ 1.0 (dikalibrasi dari corpus contoh nyata via pengukuran advance-width
 * Arial.ttf). Karakter sempit (i, l, spasi, titik) < 1; karakter lebar (m, w,
 * huruf besar) > 1 — bedanya bisa ~3-4x. Tanpa bobot ini, `wrapLines`
 * menyamaratakan "iiiii" dengan "mmmmm" padahal lebar render-nya jauh beda,
 * yang jadi biang drift K vs L pada teks yang didominasi huruf sempit
 * ("informasikan", "koordinasikan", "dilokasi", dst — umum di log gangguan).
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
 * Potong SATU paragraf teks jadi baris-baris ≤ `colWidthChars` (satuan lebar
 * berbobot, lihat CHAR_WEIGHTS) — GREEDY WORD-WRAP yang kita jalankan sendiri,
 * bukan tebakan atas apa yang Excel akan lakukan. Newline eksplisit tetap
 * dihitung sebagai pemisah paragraf terpisah. Kata tunggal yang lebih lebar
 * dari kolom dipotong paksa di tengah (Excel juga begitu).
 *
 * Hasil array ini dipakai LANGSUNG sebagai baris kolom N (bukan cuma
 * dihitung jumlahnya) — kolom M di-padding mengikuti panjang array ini persis,
 * jadi jumlah baris M dan N per entri PASTI sama (dijamin oleh konstruksi,
 * bukan lagi soal tebakan meleset atau tidak).
 */
function wrapLines(text: string, colWidthChars: number): string[] {
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
      if (used > 0 && used + SPACE_WEIGHT + w <= colWidthChars) {
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
      while (remW > colWidthChars) {
        const cut = Math.max(1, Math.floor((colWidthChars / remW) * remaining.length));
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

/** Jumlah baris hasil `wrapLines` — dipertahankan untuk kompatibilitas test unit. */
export function estimateWrappedLines(text: string, colWidthChars: number): number {
  if (!text) return 1;
  return wrapLines(text, colWidthChars).length;
}

/** Teks kolom N satu entri kegiatan (tanpa jam — jam ada di kolom M). */
function activityText(a: LengkapTicket["activities"][number]): string {
  return a.isTindakLanjut ? TINDAK_LANJUT_TEKS : a.teks;
}

export async function buildLengkapWorkbook(data: LengkapReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "mtr-Report";
  wb.created = new Date();

  // Sheet RINGKASAN (Fase 4) ditaruh PERTAMA agar pembaca melihat statistik
  // periode sebelum tabel detail. Detail sheet di bawah tak berubah.
  addSummarySheet(wb, data, buildLengkapSummary(data.tickets));

  const ws = wb.addWorksheet("REKAP LAPORAN", {
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

  // ------------------- Logo (pojok kiri atas A1:B3) -------------------
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
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
  ws.mergeCells("C2:R2");
  const t1 = ws.getCell("C2");
  t1.value = "REKAP LAPORAN PENANGANAN GANGGUAN";
  t1.font = font({ bold: true, size: 12 });
  t1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("C3:R3");
  const t2 = ws.getCell("C3");
  t2.value = "SISTEM ATM DAN JARINGAN KOMUNIKASI";
  t2.font = font({ bold: true, size: 11 });
  t2.alignment = { horizontal: "center", vertical: "middle" };

  const form = ws.getCell(`${LAST_COL}2`);
  form.value = "FORM OPS-001";
  form.font = font({ bold: true, size: 10 });
  form.alignment = { horizontal: "right", vertical: "middle" };

  // Periode (baris 5, kiri).
  ws.mergeCells("A5:H5");
  const periode = ws.getCell("A5");
  periode.value = `Periode: ${data.periodeLabel}`;
  periode.font = font({ bold: true, size: 10 });
  periode.alignment = { horizontal: "left", vertical: "middle" };

  // ------------------- Header tabel (baris 7–8) -------------------
  // Semua kolom merge vertikal X7:X8 KECUALI M & N (grup Uraian Kegiatan).
  const HEADERS: [string, string][] = [
    ["A", "No"],
    ["B", "Tanggal"],
    ["C", "Shift"],
    ["D", "Petugas"],
    ["E", "Waktu Kejadian Gangguan"],
    ["F", "Unit Kerja / Lokasi ATM"],
    ["G", "Waktu Respon Penanganan Internal"],
    ["H", "Contact Person"],
    ["I", "Jenis Gangguan"],
    ["J", "Sumber Penyebab Gangguan"],
    ["K", "Metode Penanganan Gangguan"],
    ["L", "Vendor jaringan/ATM"],
    ["O", "No Tiket Aduan dari Vendor"],
    ["P", "Waktu selesai Gangguan"],
    ["Q", "Lama penyelesaian (hh:mm)"],
    ["R", "Lama penyelesaian (Menit)"],
    ["S", "SLA (%)"],
    ["T", "Keterangan"],
  ];
  const HDR_LEFT = new Set(["F"]);
  for (const [col, label] of HEADERS) {
    ws.mergeCells(`${col}7:${col}8`);
    const cell = ws.getCell(`${col}7`);
    cell.value = label;
    cell.font = font({ bold: true, size: 9 });
    cell.alignment = {
      horizontal: HDR_LEFT.has(col) ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    };
    fill(cell, HEADER_FILL);
  }
  // Grup "Uraian Kegiatan Penanganan gangguan" (M7:N7) + sub Waktu/Kegiatan.
  ws.mergeCells("M7:N7");
  const uk = ws.getCell("M7");
  uk.value = "Uraian Kegiatan Penanganan gangguan";
  uk.font = font({ bold: true, size: 9 });
  uk.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  fill(uk, HEADER_FILL);
  for (const [col, label] of [["M", "Waktu"], ["N", "Kegiatan"]] as const) {
    const cell = ws.getCell(`${col}8`);
    cell.value = label;
    cell.font = font({ bold: true, size: 9 });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, HEADER_FILL);
  }
  borderRange(ws, "A7:T8");
  ws.getRow(7).height = 28;
  ws.getRow(8).height = 32;

  // Freeze baris header (1–8) agar tetap terlihat saat scroll.
  ws.views = [{ state: "frozen", ySplit: 8 }];

  // ------------------- Baris data (mulai 9) -------------------
  // Kolom rata kiri: F (lokasi), T (keterangan); sisanya center. Kolom N
  // (kegiatan) dirata kanan-kiri lewat JUSTIFY_COLS.
  const LEFT_COLS = new Set(["F", "T"]);
  const JUSTIFY_COLS = new Set(["N"]);
  // Kolom yang nilainya milik TIKET (satu nilai untuk semua entri kegiatan) →
  // di-merge vertikal sepanjang blok baris tiket. M & N tidak termasuk: itu
  // per-entri, satu baris Excel masing-masing.
  const TICKET_COLS = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "O", "P", "Q", "R", "S", "T",
  ];

  let r = 9;
  if (data.tickets.length === 0) {
    ws.mergeCells(`A${r}:T${r}`);
    const empty = ws.getCell(`A${r}`);
    empty.value = "Tidak ada tiket gangguan pada rentang tanggal ini.";
    empty.font = font({ italic: true, size: 10, color: { argb: "FF888888" } });
    empty.alignment = { horizontal: "center", vertical: "middle" };
    borderRange(ws, `A${r}:T${r}`);
    r++;
  }

  // Selang-seling warna per kelompok (tanggal + shift) agar mudah dibaca.
  let prevGroup = "";
  let stripe = false;
  let no = 0;

  for (const t of data.tickets) {
    const group = `${t.tanggal}|${t.shiftKode}`;
    if (group !== prevGroup) {
      stripe = !stripe;
      prevGroup = group;
    }
    no += 1;

    // SATU BARIS EXCEL PER ENTRI KEGIATAN.
    //
    // Dulu semua kegiatan satu tiket dijejalkan ke SATU baris Excel: kolom N
    // diisi paragraf-paragraf yang kita potong sendiri, kolom M dipadding baris
    // kosong supaya jamnya jatuh sebaris dengan awal kegiatannya. Cara itu
    // memaksa kita memotong teks pada lebar "aman" (~15% lebih sempit dari
    // kolom) agar Excel/WPS tidak mem-wrap ULANG potongan kita — akibatnya
    // kalimat pecah pendek-pendek, tepi kanan kolom menganggur, dan tabel
    // terlihat berantakan. Juga kena batas keras tinggi baris Excel (±409pt):
    // tiket dengan belasan kegiatan terpotong tanpa peringatan.
    //
    // Sekarang tiap entri dapat BARIS EXCEL-nya sendiri: jam (M) dan
    // kegiatannya (N) duduk di baris yang sama, jadi sejajar SECARA STRUKTURAL
    // — tanpa estimasi wrap sama sekali. Efek sampingnya semuanya positif:
    // teks kegiatan boleh ditulis UTUH dan dibiarkan Excel mem-wrap pada lebar
    // kolom sungguhannya (kolom terisi penuh, bisa rata kanan-kiri), dan batas
    // 409pt tak lagi relevan karena satu baris cuma memuat satu kegiatan.
    // Kolom milik TIKET (bukan per-entri) di-merge vertikal sepanjang blok.
    const activities = t.activities;
    const rowCount = Math.max(activities.length, 1);
    const firstRow = r;
    const lastRow = r + rowCount - 1;

    const lokasiText =
      t.atmKode === "-" && t.atmNama === "-"
        ? t.atmLokasi
        : `${t.atmKode} – ${t.atmNama}${t.atmLokasi && t.atmLokasi !== "-" ? `\n${t.atmLokasi}` : ""}`;
    const keteranganText =
      t.waktuSelesai && t.sla.selesai
        ? "Selesai"
        : "Monitoring Dilanjutkan oleh Shift berikutnya";

    ws.getCell(`A${firstRow}`).value = no;
    ws.getCell(`B${firstRow}`).value = t.tanggal;
    ws.getCell(`C${firstRow}`).value = t.shiftLabel;
    ws.getCell(`D${firstRow}`).value = t.petugas;
    ws.getCell(`E${firstRow}`).value = fmtWaktuTanggal(t.waktuOpen);
    ws.getCell(`F${firstRow}`).value = lokasiText;
    ws.getCell(`G${firstRow}`).value = t.waktuResponInternal
      ? fmtJamWIB(t.waktuResponInternal)
      : "-";
    ws.getCell(`H${firstRow}`).value = t.contactPerson || "-";
    ws.getCell(`I${firstRow}`).value = t.jenisGangguan || "-";
    ws.getCell(`J${firstRow}`).value = t.sumberPenyebab || "-";
    ws.getCell(`K${firstRow}`).value = t.metodePenanganan || "-";
    ws.getCell(`L${firstRow}`).value = t.vendor || "-";
    ws.getCell(`O${firstRow}`).value = t.noTiketVendor || "-";

    if (t.waktuSelesai && t.sla.selesai) {
      ws.getCell(`P${firstRow}`).value = fmtWaktuTanggal(t.waktuSelesai);
      ws.getCell(`Q${firstRow}`).value = t.sla.lamaHHMM ?? "-";
      const rCell = ws.getCell(`R${firstRow}`);
      rCell.value = t.sla.lamaMenit ?? 0;
      rCell.numFmt = "#,##0";
      const sla = ws.getCell(`S${firstRow}`);
      sla.value = t.sla.slaPersen ?? 0;
      sla.numFmt = "0.00%";
    } else {
      // Tiket proses: "Dalam Proses" di kolom Waktu Selesai; SLA kosong.
      ws.getCell(`P${firstRow}`).value = "Dalam Proses";
      ws.getCell(`Q${firstRow}`).value = "";
      ws.getCell(`R${firstRow}`).value = "";
      ws.getCell(`S${firstRow}`).value = "";
    }
    ws.getCell(`T${firstRow}`).value = keteranganText;

    // Merge vertikal kolom milik tiket (M/N sengaja TIDAK ikut — itu per-entri).
    if (rowCount > 1) {
      for (const col of TICKET_COLS) {
        ws.mergeCells(`${col}${firstRow}:${col}${lastRow}`);
      }
    }

    // M = jam entri, N = teks kegiatannya UTUH (di-wrap Excel sendiri).
    // Tindak lanjut dicetak bold via richText satu run.
    let blockPt = 0;
    if (activities.length === 0) {
      ws.getCell(`M${firstRow}`).value = "-";
      ws.getCell(`N${firstRow}`).value = "-";
    } else {
      activities.forEach((a, idx) => {
        const rr = firstRow + idx;
        const teks = activityText(a);
        ws.getCell(`M${rr}`).value = fmtJamWIB(a.waktu);
        ws.getCell(`N${rr}`).value = a.isTindakLanjut
          ? { richText: [{ text: teks, font: font({ size: 9, bold: true }) }] }
          : teks;
        const h = heightFor(teks, N_CHARS_PER_LINE);
        ws.getRow(rr).height = h;
        blockPt += h;
      });
    }

    // Tinggi total blok harus cukup juga untuk kolom milik tiket yang di-merge
    // (Excel TIDAK auto-fit sel ter-merge): lokasi, keterangan, dan kolom E
    // yang selalu 2 baris (jam + tanggal). Kekurangannya ditambahkan ke baris
    // terakhir blok supaya jam/kegiatan di atasnya tetap rapat.
    const ticketPt = Math.max(
      heightFor(lokasiText, lineCapacity(COL_WIDTHS.F)),
      heightFor(keteranganText, lineCapacity(COL_WIDTHS.T)),
      2 * BASE_LINE_PT + ROW_PAD_PT
    );
    if (blockPt < ticketPt) {
      const lastH = Number(ws.getRow(lastRow).height ?? 0);
      ws.getRow(lastRow).height = Math.min(lastH + (ticketPt - blockPt), MAX_ROW_HEIGHT);
    }

    // Styling seluruh blok (border + font + alignment + wrap + stripe).
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = 1; col <= 20; col++) {
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
        if (stripe) fill(cell, STRIPE_FILL);
      }
    }
    r = lastRow + 1;
  }

  // ------------------- Blok tanda tangan -------------------
  // Sumber: pilihan modal (Fase 1), BUKAN shift_reports. Tiga blok:
  // Supervisi (dengan TTD digital), Mengetahui Infra, Mengetahui Divisi.
  const sigStart = r + 2;
  const titleRow = sigStart + 1;
  const ttdTop = titleRow; // area tempel TTD (merge titleRow:titleRow+2)
  const nameRow = sigStart + 6;

  ws.mergeCells(`A${sigStart}:T${sigStart}`);
  const padang = ws.getCell(`A${sigStart}`);
  padang.value = `Padang, ${data.tanggalLabel}`;
  padang.font = font({ size: 10 });
  padang.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  const sig = data.signatures;
  const blocks: {
    c1: string;
    c2: string;
    imgCol: number;
    title: string;
    nama: string;
    ttdPath: string | null;
  }[] = [
    { c1: "D", c2: "F", imgCol: 3, title: "Supervisi", nama: sig.supervisi, ttdPath: sig.supervisiTtdPath },
    { c1: "J", c2: "L", imgCol: 9, title: "Mengetahui,\nBag. Infrastruktur TI", nama: sig.pimpinanInfra, ttdPath: null },
    { c1: "P", c2: "R", imgCol: 15, title: "Mengetahui,\nPemimpin Divisi TI", nama: sig.pimpinanDivisi, ttdPath: null },
  ];

  for (let row = titleRow; row <= titleRow + 2; row++) ws.getRow(row).height = 20;
  ws.getRow(nameRow).height = 31;

  for (const b of blocks) {
    ws.mergeCells(`${b.c1}${titleRow}:${b.c2}${titleRow + 2}`);
    const label = ws.getCell(`${b.c1}${titleRow}`);
    label.value = b.title;
    label.font = font({ size: 10 });
    label.alignment = { horizontal: "center", vertical: "top", wrapText: true };

    ws.mergeCells(`${b.c1}${nameRow}:${b.c2}${nameRow}`);
    const name = ws.getCell(`${b.c1}${nameRow}`);
    name.value = `( ${b.nama || "…………………………"} )`;
    name.font = font({ size: 10 });
    name.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // TTD digital (hanya supervisi) ditempel sebagai gambar melayang di atas
    // area label, dipusatkan horizontal di kolom c1:c2.
    if (b.ttdPath) {
      const ttdAbs = join(process.cwd(), "public", b.ttdPath.replace(/^\//, ""));
      const low = b.ttdPath.toLowerCase();
      const ext = low.endsWith(".jpg") || low.endsWith(".jpeg") ? "jpeg" : "png";
      if (existsSync(ttdAbs)) {
        const ttdId = wb.addImage({
          buffer: readFileSync(ttdAbs) as unknown as ArrayBuffer,
          extension: ext,
        });
        const EMU_PX = 9525;
        const colPx = (w: number) => Math.round(w * 7 + 5);
        const w1 = colPx(COL_WIDTHS[b.c1]);
        let leftPx = Math.max(0, (w1 + colPx(COL_WIDTHS[b.c2]) - TTD_W) / 2);
        let nativeCol = b.imgCol;
        if (leftPx > w1) {
          leftPx -= w1;
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

  ws.pageSetup.printArea = `A1:${LAST_COL}${nameRow}`;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// ----------------------------- Sheet RINGKASAN (Fase 4) -----------------------------

const SUMMARY_TITLE_FILL = "FF83CAFF"; // header kartu (samakan tema tabel)
const SUMMARY_VALUE_FILL = "FFF1F5F9"; // baris isi kartu (zebra lembut)

/** Satu baris isi kartu: label kiri + nilai kanan. Nilai bisa angka/persen/teks. */
interface CardRow {
  label: string;
  value: string | number;
  /** numFmt opsional (mis. "0.00%" untuk SLA). */
  numFmt?: string;
}

/**
 * Gambar satu kartu (header berwarna + baris label/nilai) di kolom [colLabel]
 * (label) & [colVal] (nilai) mulai baris `startRow`. Kembalikan baris kosong
 * berikutnya setelah kartu (sudah +1 jarak).
 */
function drawCard(
  ws: ExcelJS.Worksheet,
  startRow: number,
  colLabel: string,
  colVal: string,
  title: string,
  rows: CardRow[]
): number {
  let r = startRow;

  // Header kartu (merge label..val).
  ws.mergeCells(`${colLabel}${r}:${colVal}${r}`);
  const head = ws.getCell(`${colLabel}${r}`);
  head.value = title;
  head.font = font({ bold: true, size: 10 });
  head.alignment = { horizontal: "left", vertical: "middle" };
  fill(head, SUMMARY_TITLE_FILL);
  box(ws.getCell(`${colLabel}${r}`));
  box(ws.getCell(`${colVal}${r}`));
  ws.getRow(r).height = 18;
  r++;

  for (const row of rows) {
    const labelCell = ws.getCell(`${colLabel}${r}`);
    labelCell.value = row.label;
    labelCell.font = font({ size: 9 });
    labelCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    fill(labelCell, SUMMARY_VALUE_FILL);
    box(labelCell);

    const valCell = ws.getCell(`${colVal}${r}`);
    valCell.value = row.value;
    valCell.font = font({ size: 9, bold: true });
    valCell.alignment = { horizontal: "right", vertical: "middle" };
    if (row.numFmt) valCell.numFmt = row.numFmt;
    fill(valCell, SUMMARY_VALUE_FILL);
    box(valCell);

    ws.getRow(r).height = 16;
    r++;
  }

  return r + 1; // sisakan satu baris jarak antar kartu
}

/**
 * Sheet "RINGKASAN": empat kartu statistik (Ringkasan Periode, Rekap per Shift,
 * Rekap per Petugas, Top 5 Gangguan) disusun dua kolom agar rapi & ringkas.
 */
function addSummarySheet(
  wb: ExcelJS.Workbook,
  data: LengkapReportData,
  s: LengkapSummary
) {
  const ws = wb.addWorksheet("RINGKASAN", {
    pageSetup: {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 15 },
  });

  // Dua kolom kartu: kiri B(label)/C(value), kanan E(label)/F(value).
  ws.getColumn("A").width = 2.0;
  ws.getColumn("B").width = 30.0;
  ws.getColumn("C").width = 13.0;
  ws.getColumn("D").width = 2.5;
  ws.getColumn("E").width = 30.0;
  ws.getColumn("F").width = 13.0;

  // ------- Judul -------
  ws.getRow(1).height = 18;
  if (data.logoPath && existsSync(data.logoPath)) {
    const lower = data.logoPath.toLowerCase();
    const extension = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
    const imgId = wb.addImage({
      buffer: readFileSync(data.logoPath) as unknown as ArrayBuffer,
      extension,
    });
    ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 80, height: 50 } });
  }

  ws.mergeCells("B1:F1");
  const title = ws.getCell("B1");
  title.value = "RINGKASAN REKAP PENANGANAN GANGGUAN";
  title.font = font({ bold: true, size: 12 });
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("B2:F2");
  const periode = ws.getCell("B2");
  periode.value = `Periode: ${data.periodeLabel}`;
  periode.font = font({ bold: true, size: 10 });
  periode.alignment = { horizontal: "center", vertical: "middle" };

  const topRow = 4;

  // ------- Kolom KIRI: Ringkasan Periode + Rekap per Shift -------
  const ringkasanRows: CardRow[] = [
    { label: "Total Tiket", value: s.total },
    { label: "Tiket ATM", value: s.atm },
    { label: "Tiket Jaringan", value: s.jaringan },
    { label: "Tiket Selesai", value: s.selesai },
    { label: "Tiket Masih Proses", value: s.proses },
    {
      label: "Rata-rata SLA",
      value: s.avgSlaPersen ?? "-",
      numFmt: s.avgSlaPersen === null ? undefined : "0.00%",
    },
    { label: "Rata-rata Lama Penanganan", value: s.avgLamaLabel },
  ];
  let leftNext = drawCard(ws, topRow, "B", "C", "Ringkasan Periode", ringkasanRows);

  const shiftRows: CardRow[] = s.perShift.map((sh) => ({
    label: sh.label,
    value: sh.jumlah,
  }));
  leftNext = drawCard(ws, leftNext, "B", "C", "Rekap per Shift", shiftRows);

  // ------- Kolom KANAN: Rekap per Petugas + Top 5 Gangguan -------
  const petugasRows: CardRow[] =
    s.perPetugas.length > 0
      ? s.perPetugas.map((p) => ({ label: p.petugas, value: p.jumlah }))
      : [{ label: "(tidak ada petugas)", value: "-" }];
  let rightNext = drawCard(ws, topRow, "E", "F", "Rekap per Petugas", petugasRows);

  const gangguanRows: CardRow[] =
    s.topGangguan.length > 0
      ? s.topGangguan.map((g) => ({ label: g.jenis, value: g.jumlah }))
      : [{ label: "(tidak ada gangguan)", value: "-" }];
  rightNext = drawCard(ws, rightNext, "E", "F", "Rekap Gangguan Terbanyak (Top 5)", gangguanRows);

  const lastRow = Math.max(leftNext, rightNext);
  ws.pageSetup.printArea = `A1:F${lastRow}`;
}

/** Terapkan border tipis ke seluruh sel pada rentang "A1:T8". */
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
