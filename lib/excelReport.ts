// Generator laporan harian Form OPS-001 (PRD §4.D, §5, §7).
//
// Membangun workbook ExcelJS sel-per-sel sesuai mapping kolom B–S di PRD §5
// sehingga hasil identik dengan template Excel existing. Fungsi ini murni:
// menerima ReportData (tanpa I/O DB) agar bisa dipakai API route & skrip contoh.

import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TZ = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

// Warna korporat Bank Nagari.
const BLUE = "FF003580";

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
  penerima: string;
  supervisi: string;
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
}

// ----------------------------- Util waktu -----------------------------

/** Serial Excel dari sebuah instant, ditampilkan sebagai jam dinding WIB. */
function excelSerialWIB(d: Date): number {
  const wibMs = d.getTime() + WIB_OFFSET_MS;
  return (wibMs - EXCEL_EPOCH_UTC) / 86400000;
}

function fmtJamWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

// ----------------------------- Helper styling -----------------------------

const THIN = { style: "thin" as const, color: { argb: "FF888888" } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function box(cell: ExcelJS.Cell) {
  cell.border = ALL_BORDERS;
}

function headFill(cell: ExcelJS.Cell, argb = BLUE) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Terapkan border tipis ke seluruh sel pada rentang "A1:C3". */
function borderRange(ws: ExcelJS.Worksheet, range: string) {
  const [a, b] = range.split(":");
  const start = ws.getCell(a);
  const end = ws.getCell(b);
  for (let r = Number(start.row); r <= Number(end.row); r++) {
    for (let c = Number(start.col); c <= Number(end.col); c++) {
      box(ws.getCell(r, c));
    }
  }
}

// ----------------------------- Generator -----------------------------

const COL_WIDTHS: Record<string, number> = {
  A: 3, B: 5, C: 12, D: 24, E: 12, F: 16, G: 18, H: 20, I: 20,
  J: 14, K: 11, L: 32, M: 14, N: 14, O: 11, P: 11, Q: 13, R: 9, S: 16,
};

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

  // ------------------- Logo Bank Nagari (pojok kiri atas) -------------------
  const logoPath = join(process.cwd(), "public", "logo-bank-nagari.png");
  if (existsSync(logoPath)) {
    const imgId = wb.addImage({
      buffer: readFileSync(logoPath) as unknown as ArrayBuffer,
      extension: "png",
    });
    ws.addImage(imgId, { tl: { col: 0.25, row: 0.2 }, ext: { width: 132, height: 40 } });
  }
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 22;

  // ------------------- Header laporan -------------------
  ws.mergeCells("B2:R2");
  const t1 = ws.getCell("B2");
  t1.value = "LAPORAN HARIAN PENANGANAN GANGGUAN";
  t1.font = { bold: true, size: 14, color: { argb: BLUE } };
  t1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("B3:Q3");
  const t2 = ws.getCell("B3");
  t2.value = "SISTEM ATM DAN JARINGAN KOMUNIKASI";
  t2.font = { bold: true, size: 11, color: { argb: "FF333333" } };
  t2.alignment = { horizontal: "center", vertical: "middle" };

  const form = ws.getCell("S3");
  form.value = "FORM OPS-001";
  form.font = { bold: true, size: 9 };
  form.alignment = { horizontal: "center", vertical: "middle" };
  box(form);

  // ------------------- Info petugas (kiri, baris 8–10) -------------------
  const info: [string, string, string][] = [
    ["B8", "Hari / Tgl", data.hariTgl],
    ["B9", "Nama Petugas", data.namaPetugas],
    ["B10", "Waktu Shift", data.shiftLabel],
  ];
  for (const [anchor, label, value] of info) {
    const row = Number(anchor.slice(1));
    ws.mergeCells(`B${row}:C${row}`);
    ws.mergeCells(`D${row}:F${row}`);
    const l = ws.getCell(`B${row}`);
    l.value = label;
    l.font = { bold: true, size: 10 };
    l.alignment = { vertical: "middle" };
    const v = ws.getCell(`D${row}`);
    v.value = value;
    v.font = { size: 10 };
    v.alignment = { vertical: "middle" };
  }

  // ------------------- Blok Log Server (G5:L10) -------------------
  ws.mergeCells("G5:H5");
  ws.mergeCells("I5:J5");
  ws.mergeCells("K5:L5");
  const sv: [string, string][] = [
    ["G5", "Server"],
    ["I5", "Awal Shift"],
    ["K5", "Akhir Shift"],
  ];
  for (const [c, label] of sv) {
    const cell = ws.getCell(c);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    headFill(cell);
  }
  data.servers.slice(0, 5).forEach((s, i) => {
    const r = 6 + i;
    ws.mergeCells(`G${r}:H${r}`);
    ws.mergeCells(`I${r}:J${r}`);
    ws.mergeCells(`K${r}:L${r}`);
    const name = ws.getCell(`G${r}`);
    name.value = s.label;
    name.font = { bold: true, size: 9 };
    name.alignment = { vertical: "middle" };
    const awal = ws.getCell(`I${r}`);
    awal.value = s.awal || "-";
    awal.font = { size: 9 };
    awal.alignment = { horizontal: "center", vertical: "middle" };
    const akhir = ws.getCell(`K${r}`);
    akhir.value = s.akhir || "-";
    akhir.font = { size: 9 };
    akhir.alignment = { horizontal: "center", vertical: "middle" };
  });
  borderRange(ws, "G5:L10");

  // ------------------- Blok Suhu AC (N5:R9) -------------------
  const acHead: [string, string][] = [
    ["N5", "Cek"],
    ["O5", "Waktu"],
    ["P5", "Room Server"],
    ["Q5", "R. Panel"],
    ["R5", "AC Ki/Ka"],
  ];
  for (const [c, label] of acHead) {
    const cell = ws.getCell(c);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    headFill(cell);
  }
  for (let i = 0; i < 3; i++) {
    const r = 6 + i;
    const chk = data.acChecks.find((a) => a.urutan === i + 1);
    ws.getCell(`N${r}`).value = i + 1;
    ws.getCell(`N${r}`).alignment = { horizontal: "center", vertical: "middle" };
    const w = ws.getCell(`O${r}`);
    if (chk?.waktu) {
      w.value = excelSerialWIB(chk.waktu);
      w.numFmt = "hh:mm";
    } else {
      w.value = "-";
    }
    w.alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(`P${r}`).value = chk?.room || "-";
    ws.getCell(`Q${r}`).value = chk?.panel || "-";
    ws.getCell(`R${r}`).value = chk
      ? `${chk.kiri ? "Aktif" : "Mati"} / ${chk.kanan ? "Aktif" : "Mati"}`
      : "-";
    for (const col of ["P", "Q", "R"]) {
      ws.getCell(`${col}${r}`).font = { size: 9 };
      ws.getCell(`${col}${r}`).alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  ws.mergeCells("N9:Q9");
  const p12label = ws.getCell("N9");
  p12label.value = "Pemantauan Berkala 12 Jam (Ki / Ka)";
  p12label.font = { size: 9, bold: true };
  p12label.alignment = { vertical: "middle" };
  const chk12 = data.acChecks.find((a) => a.p12kiri || a.p12kanan);
  const p12val = ws.getCell("R9");
  p12val.value = chk12 ? `${chk12.p12kiri || "-"} / ${chk12.p12kanan || "-"}` : "-";
  p12val.font = { size: 9 };
  p12val.alignment = { horizontal: "center", vertical: "middle" };
  borderRange(ws, "N5:R9");

  // ------------------- Total Menit dalam Bulan (O10/S10) -------------------
  ws.mergeCells("O10:R10");
  const tmLabel = ws.getCell("O10");
  tmLabel.value = "Total Menit dalam 1 Bulan =";
  tmLabel.font = { bold: true, size: 9 };
  tmLabel.alignment = { horizontal: "right", vertical: "middle" };
  const tmVal = ws.getCell("S10");
  tmVal.value = { formula: `24*60*${data.jumlahHari}` };
  tmVal.numFmt = "#,##0";
  tmVal.font = { bold: true, size: 9 };
  tmVal.alignment = { horizontal: "center", vertical: "middle" };
  box(tmVal);

  // ------------------- Header tabel tiket (baris 12–13) -------------------
  const HEADERS: [string, string][] = [
    ["B", "No"],
    ["C", "Waktu Kejadian Gangguan"],
    ["D", "Unit Kerja / Tempat Kejadian"],
    ["E", "Waktu Respon Penanganan Internal"],
    ["F", "Contact Person"],
    ["G", "Jenis Gangguan"],
    ["H", "Sumber Penyebab Gangguan"],
    ["I", "Metode Penanganan Gangguan"],
    ["J", "Vendor Jaringan / ATM"],
    ["M", "No Tiket Aduan dari Vendor"],
    ["N", "Waktu Selesai Gangguan"],
    ["O", "Lama Penyelesaian (hh:mm)"],
    ["P", "Lama Penyelesaian (Menit)"],
    ["Q", "Total Waktu 1 Bulan (Menit)"],
    ["R", "SLA (%)"],
    ["S", "Keterangan"],
  ];
  for (const [col, label] of HEADERS) {
    ws.mergeCells(`${col}12:${col}13`);
    const cell = ws.getCell(`${col}12`);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    headFill(cell);
  }
  // Grup "Uraian Kegiatan" K/L.
  ws.mergeCells("K12:L12");
  const uk = ws.getCell("K12");
  uk.value = "Uraian Kegiatan";
  uk.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
  uk.alignment = { horizontal: "center", vertical: "middle" };
  headFill(uk);
  for (const [col, label] of [["K", "Waktu"], ["L", "Kegiatan"]] as const) {
    const cell = ws.getCell(`${col}13`);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    headFill(cell);
  }
  ws.getRow(12).height = 30;
  ws.getRow(13).height = 16;

  // ------------------- Baris data tiket (mulai 14) -------------------
  let r = 14;
  if (data.tickets.length === 0) {
    ws.mergeCells(`B${r}:S${r}`);
    const empty = ws.getCell(`B${r}`);
    empty.value = "Tidak ada tiket gangguan pada shift ini.";
    empty.font = { italic: true, size: 10, color: { argb: "FF888888" } };
    empty.alignment = { horizontal: "center", vertical: "middle" };
    borderRange(ws, `B${r}:S${r}`);
    r++;
  }

  for (const t of data.tickets) {
    const lines = Math.max(t.activities.length, 1);
    ws.getRow(r).height = Math.min(lines * 13 + 6, 220);

    ws.getCell(`B${r}`).value = t.no;
    const c = ws.getCell(`C${r}`);
    c.value = excelSerialWIB(t.waktuKejadian);
    c.numFmt = "hh:mm";
    ws.getCell(`D${r}`).value = t.unitKerja;
    ws.getCell(`E${r}`).value = t.waktuRespon || "-";
    ws.getCell(`F${r}`).value = t.contactPerson || "-";
    ws.getCell(`G${r}`).value = t.jenisGangguan || "-";
    ws.getCell(`H${r}`).value = t.sumberPenyebab || "-";
    ws.getCell(`I${r}`).value = t.metodePenanganan || "-";
    ws.getCell(`J${r}`).value = t.vendor || "-";

    const kText = t.activities
      .map((a) => (a.isTindakLanjut ? "" : fmtJamWIB(a.waktu)))
      .join("\n");
    const lText = t.activities
      .map((a) =>
        a.isTindakLanjut ? "» TINDAK LANJUT MONITORING SELANJUTNYA" : a.teks
      )
      .join("\n");
    ws.getCell(`K${r}`).value = kText || "-";
    ws.getCell(`L${r}`).value = lText || "-";

    ws.getCell(`M${r}`).value = t.noTiketVendor || "-";

    if (t.waktuSelesai) {
      const n = ws.getCell(`N${r}`);
      n.value = excelSerialWIB(t.waktuSelesai);
      n.numFmt = "hh:mm";
      const o = ws.getCell(`O${r}`);
      o.value = { formula: `N${r}-C${r}` };
      o.numFmt = "[h]:mm";
      const p = ws.getCell(`P${r}`);
      p.value = { formula: `O${r}*24*60` };
      p.numFmt = "#,##0";
      const q = ws.getCell(`Q${r}`);
      q.value = { formula: `$S$10-P${r}` };
      q.numFmt = "#,##0";
      const sla = ws.getCell(`R${r}`);
      sla.value = { formula: `Q${r}/$S$10` };
      sla.numFmt = "0.00%";
    } else {
      // Tiket masih proses: N:P merge "Dalam Proses", Q:R merge teks lanjutan.
      ws.mergeCells(`N${r}:P${r}`);
      const np = ws.getCell(`N${r}`);
      np.value = "Dalam Proses";
      np.alignment = { horizontal: "center", vertical: "middle" };
      np.font = { italic: true, size: 9, color: { argb: BLUE } };
      ws.mergeCells(`Q${r}:R${r}`);
      const qr = ws.getCell(`Q${r}`);
      qr.value = "Monitoring Dilanjutkan oleh Shift berikutnya";
      qr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      qr.font = { italic: true, size: 8, color: { argb: "FF666666" } };
    }

    ws.getCell(`S${r}`).value = t.keterangan || "-";

    // Styling umum baris (border + alignment + font dasar).
    const WRAP_COLS = new Set(["D", "K", "L", "Q"]);
    const CENTER_COLS = new Set(["B", "C", "E", "N", "O", "P", "Q", "R"]);
    for (let col = 2; col <= 19; col++) {
      const cell = ws.getCell(r, col);
      box(cell);
      cell.font = { ...(cell.font ?? {}), size: cell.font?.size ?? 9 };
      const letter = cell.address.replace(/\d+/g, "");
      cell.alignment = {
        vertical: "top",
        wrapText: WRAP_COLS.has(letter),
        horizontal: CENTER_COLS.has(letter) ? "center" : "left",
      };
    }
    r++;
  }

  // ------------------- Blok tanda tangan -------------------
  const sigStart = Math.max(25, r + 1);
  const titleRow = sigStart + 1;
  const nameRow = sigStart + 6;

  ws.mergeCells(`B${sigStart}:F${sigStart}`);
  const padang = ws.getCell(`B${sigStart}`);
  padang.value = `Padang, ${data.tanggalLabel}`;
  padang.font = { size: 10 };
  padang.alignment = { vertical: "middle" };

  const sig = data.signatures;
  const titles: [string, string, string][] = [
    ["C", "E", "Petugas Monitoring yang menyerahkan"],
    ["F", "H", "Petugas Monitoring yang Menerima"],
    ["I", "K", "Supervisi"],
    ["O", "P", "Mengetahui,\nBag. Infrastruktur TI"],
    ["R", "S", "Mengetahui,\nPemimpin Divisi"],
  ];
  const names: [string, string, string][] = [
    ["C", "E", sig.penyerah],
    ["F", "H", sig.penerima],
    ["I", "K", sig.supervisi],
    ["O", "P", sig.pimpinanInfra],
    ["R", "S", sig.pimpinanDivisi],
  ];

  for (const [c1, c2, label] of titles) {
    ws.mergeCells(`${c1}${titleRow}:${c2}${titleRow}`);
    const cell = ws.getCell(`${c1}${titleRow}`);
    cell.value = label;
    cell.font = { size: 9 };
    cell.alignment = { horizontal: "center", vertical: "top", wrapText: true };
  }
  ws.getRow(titleRow).height = 28;

  for (const [c1, c2, nama] of names) {
    ws.mergeCells(`${c1}${nameRow}:${c2}${nameRow}`);
    const cell = ws.getCell(`${c1}${nameRow}`);
    cell.value = `( ${nama || "…………………………"} )`;
    cell.font = { size: 9, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: THIN };
  }

  // TTD digital supervisi (jika sudah approve & file tersedia).
  if (sig.supervisiTtdPath) {
    const ttdAbs = join(process.cwd(), "public", sig.supervisiTtdPath.replace(/^\//, ""));
    const ext = sig.supervisiTtdPath.toLowerCase().endsWith(".jpg") ||
      sig.supervisiTtdPath.toLowerCase().endsWith(".jpeg")
      ? "jpeg"
      : "png";
    if (existsSync(ttdAbs) && (ext === "png" || ext === "jpeg")) {
      const ttdId = wb.addImage({
        buffer: readFileSync(ttdAbs) as unknown as ArrayBuffer,
        extension: ext,
      });
      ws.addImage(ttdId, {
        tl: { col: 8.2, row: titleRow + 0.6 }, // kolom I (index 8) area Supervisi
        ext: { width: 110, height: 55 },
      });
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
