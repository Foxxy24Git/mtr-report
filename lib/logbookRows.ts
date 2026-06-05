// Pemetaan tiket → baris logbook (PRD revisi §4.D). Modul MURNI (tanpa I/O DB
// / server-only) agar bisa diuji unit & dipakai dari gather server-side.

import { SHIFT_LABELS } from "@/lib/constants";
import { computeSla } from "@/lib/sla";

const TZ = "Asia/Jakarta";

function fmtTanggal(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(d); // dd/mm/yyyy
}

function fmtJam(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d); // HH:mm
}

/** "dd/MM HH:mm" — ringkas untuk kolom Waktu Kegiatan (logbook lintas hari). */
function fmtTglJamRingkas(d: Date): string {
  const tgl = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ,
  }).format(d);
  return `${tgl} ${fmtJam(d)}`;
}

/** Bentuk tiket minimal yang dibutuhkan mapper (agar bisa diuji tanpa Prisma). */
export interface LogbookTicketInput {
  noTiket: string;
  openShiftKode: string;
  waktuOpen: Date;
  waktuResponInternal: Date | null;
  cpTipe: "wag" | "pic" | null;
  cpNama: string | null;
  cpTelp: string | null;
  jenisGangguan: string | null;
  sumberPenyebab: string | null;
  metodePenanganan: string | null;
  vendor: string | null;
  noTiketVendor: string | null;
  status: string;
  waktuSelesai: Date | null;
  keterangan: string | null;
  atm: { kodeAtm: string; namaAtm: string } | null;
  activities: { waktu: Date; teks: string; isTindakLanjutFlag: boolean }[];
}

export interface LogbookRow {
  no: number;
  tanggalOpen: string;
  shift: string;
  noTiket: string;
  waktuKejadian: string;
  unitKerja: string;
  waktuRespon: string;
  contactPerson: string;
  jenisGangguan: string;
  sumberPenyebab: string;
  metodePenanganan: string;
  vendor: string;
  /** Timestamp tiap entri kegiatan, satu per baris (sejajar uraianKegiatan). */
  waktuKegiatan: string;
  /** Seluruh kronologi kegiatan (pembuka + tindak lanjut user lain), satu per baris. */
  uraianKegiatan: string;
  noTiketVendor: string;
  waktuSelesai: string;
  lama: string;
  /** Pecahan 0..1 (numFmt persen di Excel). null bila tiket masih proses. */
  slaPersen: number | null;
  status: string;
  keterangan: string;
}

function contactPersonText(t: LogbookTicketInput): string {
  if (t.cpTipe === "wag") return "WAG";
  if (t.cpTipe === "pic")
    return `${t.cpNama ?? "-"}${t.cpTelp ? ` (${t.cpTelp})` : ""}`;
  return "-";
}

/**
 * Petakan tiket → baris logbook. Kolom Uraian Kegiatan memuat SELURUH kronologi
 * (kegiatan pembuka + tindak lanjut user shift berikutnya, termasuk penanda
 * "TINDAK LANJUT MONITORING SELANJUTNYA") — tidak dipotong (PRD revisi §4.D).
 */
export function buildLogbookRows(tickets: LogbookTicketInput[]): LogbookRow[] {
  return tickets.map((t, i) => {
    const sla = computeSla(t.waktuOpen, t.status === "selesai" ? t.waktuSelesai : null);
    const acts = t.activities;
    return {
      no: i + 1,
      tanggalOpen: fmtTanggal(t.waktuOpen),
      shift: SHIFT_LABELS[t.openShiftKode] ?? `Shift ${t.openShiftKode}`,
      noTiket: t.noTiket,
      waktuKejadian: fmtJam(t.waktuOpen),
      unitKerja: t.atm ? `${t.atm.kodeAtm} – ${t.atm.namaAtm}` : "-",
      waktuRespon: t.waktuResponInternal ? fmtJam(t.waktuResponInternal) : "-",
      contactPerson: contactPersonText(t),
      jenisGangguan: t.jenisGangguan ?? "-",
      sumberPenyebab: t.sumberPenyebab ?? "-",
      metodePenanganan: t.metodePenanganan ?? "-",
      vendor: t.vendor ?? "-",
      waktuKegiatan: acts.map((a) => fmtTglJamRingkas(a.waktu)).join("\n"),
      uraianKegiatan: acts.map((a) => a.teks).join("\n"),
      noTiketVendor: t.noTiketVendor ?? "-",
      waktuSelesai:
        t.status === "selesai" && t.waktuSelesai
          ? `${fmtTanggal(t.waktuSelesai)} ${fmtJam(t.waktuSelesai)}`
          : "Dalam Proses",
      lama: sla.lamaHHMM ?? "Dalam Proses",
      slaPersen: sla.slaPersen,
      status: t.status === "selesai" ? "Selesai" : "Dalam Proses",
      // Kolom Keterangan: tiket close = "Selesai"; tiket masih proses =
      // "Monitoring Dilanjutkan oleh Shift berikutnya".
      keterangan:
        t.status === "selesai"
          ? "Selesai"
          : "Monitoring Dilanjutkan oleh Shift berikutnya",
    };
  });
}
