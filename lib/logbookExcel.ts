// Generator "LOGBOOK PENANGANAN GANGGUAN" (Rekap Laporan — Download per User).
//
// Membangun SATU sheet .xlsx ("LOGBOOK <NAMA USER>") berisi seluruh tiket yang
// DI-OPEN oleh satu petugas pada rentang tanggal tertentu (logbook pribadi),
// lengkap dengan kronologi kegiatan (termasuk tindak lanjut oleh user lain).
// Data dari lib/logbookData.gatherLogbookData. Gaya visual mengikuti laporan
// lain (header biru FF83CAFF, font Swis721 Lt BT → fallback Arial, border thin,
// landscape fit-to-width).

import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LogbookData } from "@/lib/logbookData";
import type { LogbookRow } from "@/lib/logbookRows";

// Font & warna selaras laporan lain.
const FONT = "Swis721 Lt BT";
const BLACK = "FF000000";
const HEADER_FILL = "FF83CAFF"; // biru muda header tabel
const STRIPE_FILL = "FFF7FAFC"; // zebra lembut

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

// ----------------------------- Kolom A–T -----------------------------

interface ColDef {
  col: string;
  header: string;
  width: number;
  left?: boolean;
  /** Ambil nilai sel dari baris logbook (string atau number untuk SLA). */
  get: (r: LogbookRow) => string | number | null;
}

const COLUMNS: ColDef[] = [
  { col: "A", header: "No", width: 4.5, get: (r) => r.no },
  { col: "B", header: "Tanggal Open", width: 12, get: (r) => r.tanggalOpen },
  { col: "C", header: "Shift", width: 16, left: true, get: (r) => r.shift },
  { col: "D", header: "No Tiket", width: 16, get: (r) => r.noTiket },
  { col: "E", header: "Waktu Kejadian", width: 11, get: (r) => r.waktuKejadian },
  { col: "F", header: "Unit Kerja / Lokasi ATM", width: 26, left: true, get: (r) => r.unitKerja },
  { col: "G", header: "Waktu Respon Internal", width: 12, get: (r) => r.waktuRespon },
  { col: "H", header: "Contact Person", width: 18, left: true, get: (r) => r.contactPerson },
  { col: "I", header: "Jenis Gangguan", width: 20, left: true, get: (r) => r.jenisGangguan },
  { col: "J", header: "Sumber Penyebab", width: 20, left: true, get: (r) => r.sumberPenyebab },
  { col: "K", header: "Metode Penanganan", width: 22, left: true, get: (r) => r.metodePenanganan },
  { col: "L", header: "Vendor", width: 16, left: true, get: (r) => r.vendor },
  { col: "M", header: "Waktu Kegiatan", width: 14, left: true, get: (r) => r.waktuKegiatan },
  { col: "N", header: "Uraian Kegiatan", width: 44, left: true, get: (r) => r.uraianKegiatan },
  { col: "O", header: "No Tiket Vendor", width: 14, get: (r) => r.noTiketVendor },
  { col: "P", header: "Waktu Selesai", width: 16, get: (r) => r.waktuSelesai },
  { col: "Q", header: "Lama (hh:mm)", width: 11, get: (r) => r.lama },
  { col: "R", header: "SLA%", width: 9, get: (r) => r.slaPersen },
  { col: "S", header: "Status", width: 12, get: (r) => r.status },
  { col: "T", header: "Keterangan", width: 22, left: true, get: (r) => r.keterangan },
];

const LAST_COL = "T";
const LAST_COL_IDX = COLUMNS.length; // 20

export async function buildLogbookWorkbook(
  data: LogbookData,
  sheetName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "mtr-Report";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 15 },
  });

  for (const c of COLUMNS) ws.getColumn(c.col).width = c.width;
  ws.properties.defaultColWidth = 12;

  // ------------------- Logo (pojok kiri atas) -------------------
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 18;
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
    ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 84, height: 60 } });
  }

  // ------------------- Header judul -------------------
  ws.mergeCells("C1:N1");
  const t1 = ws.getCell("C1");
  t1.value = "LOGBOOK PENANGANAN GANGGUAN";
  t1.font = font({ bold: true, size: 14 });
  t1.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("C2:N2");
  const t2 = ws.getCell("C2");
  t2.value = "SISTEM ATM DAN JARINGAN KOMUNIKASI — BANK NAGARI";
  t2.font = font({ size: 10, italic: true });
  t2.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A4:F4");
  const nm = ws.getCell("A4");
  nm.value = `Nama Petugas: ${data.namaPetugas}`;
  nm.font = font({ bold: true, size: 10 });
  nm.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells("A5:F5");
  const pr = ws.getCell("A5");
  pr.value = `Periode: ${data.periodeLabel}`;
  pr.font = font({ bold: true, size: 10 });
  pr.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells(`O5:${LAST_COL}5`);
  const tot = ws.getCell("O5");
  tot.value = `Total tiket: ${data.rows.length}`;
  tot.font = font({ size: 10, italic: true });
  tot.alignment = { horizontal: "right", vertical: "middle" };

  // ------------------- Header tabel (baris 7) -------------------
  const HDR_ROW = 7;
  for (const c of COLUMNS) {
    const cell = ws.getCell(`${c.col}${HDR_ROW}`);
    cell.value = c.header;
    cell.font = font({ bold: true, size: 9 });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, HEADER_FILL);
    box(cell);
  }
  ws.getRow(HDR_ROW).height = 32;
  ws.views = [{ state: "frozen", ySplit: HDR_ROW }];

  // ------------------- Baris data (mulai 8) -------------------
  let r = HDR_ROW + 1;

  if (data.rows.length === 0) {
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const empty = ws.getCell(`A${r}`);
    empty.value = "Tidak ada tiket yang di-open petugas ini pada rentang tersebut.";
    empty.font = font({ italic: true, size: 10, color: { argb: "FF888888" } });
    empty.alignment = { horizontal: "center", vertical: "middle" };
    for (let cIdx = 1; cIdx <= LAST_COL_IDX; cIdx++) box(ws.getCell(r, cIdx));
    r++;
  }

  data.rows.forEach((row, idx) => {
    const stripe = idx % 2 === 1 ? STRIPE_FILL : "FFFFFFFF";
    for (const c of COLUMNS) {
      const cell = ws.getCell(`${c.col}${r}`);
      const val = c.get(row);
      cell.value = val ?? "-";
      cell.font = font({ size: 9, bold: c.col === "D" });
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: c.left ? "left" : "center",
      };
      box(cell);
      fill(cell, stripe);
      if (c.col === "R") {
        // SLA%: numerik 0..1 dengan format persen; "-" bila masih proses.
        if (typeof val === "number") cell.numFmt = "0.00%";
        else cell.value = "-";
      }
    }
    // Tinggi baris menyesuaikan jumlah entri kegiatan (uraian multiline).
    const lineCount = Math.max(1, (row.uraianKegiatan.match(/\n/g)?.length ?? 0) + 1);
    ws.getRow(r).height = Math.min(160, Math.max(28, lineCount * 14));
    r++;
  });

  ws.pageSetup.printArea = `A1:${LAST_COL}${r - 1}`;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
