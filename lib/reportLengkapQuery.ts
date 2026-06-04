// Query & agregasi "Download Laporan Lengkap" (Fase 2).
//
// Mengambil SEMUA tiket dalam satu rentang tanggal — dari SEMUA petugas & SEMUA
// shift — digabung jadi satu dataset datar siap-cetak Excel. Berbeda dari
// laporan harian/shift (lib/reportData.ts) yang di-scope per shift & per owner.
//
// Modul PURE (tanpa prisma / server-only) agar bisa diuji unit & dipakai script
// verifikasi. Orkestrasi DB ada di lib/reportLengkapData.ts.

import type { Prisma, TicketStatus } from "@prisma/client";
import { SHIFT_NAMES } from "./constants";
import { computeSla, formatSlaPersen, type SlaResult } from "./sla";

const TZ = "Asia/Jakarta";

export interface LengkapRange {
  /** Awal hari (WIB) tanggal "dari" — inklusif. */
  startWib: Date;
  /** Awal hari (WIB) sehari setelah "sampai" — eksklusif (BETWEEN inklusif). */
  endWib: Date;
}

/**
 * Rentang [start, end) WIB dari dua tanggal YYYY-MM-DD (inklusif kedua ujung).
 * Setara SQL: `DATE(created_at) BETWEEN :dari AND :sampai`.
 */
export function computeLengkapRange(
  tanggalDari: string,
  tanggalSampai: string
): LengkapRange {
  const startWib = new Date(`${tanggalDari}T00:00:00+07:00`);
  const sampaiStart = new Date(`${tanggalSampai}T00:00:00+07:00`);
  const endWib = new Date(sampaiStart.getTime() + 24 * 60 * 60 * 1000);
  return { startWib, endWib };
}

/**
 * Klausa `where` Prisma: SEMUA tiket dalam rentang — TANPA filter owner & TANPA
 * filter shift. Difilter via `createdAt` (waktu pencatatan tiket) sesuai spec.
 */
export function buildLengkapTicketWhere(r: LengkapRange): Prisma.TicketWhereInput {
  return { createdAt: { gte: r.startWib, lt: r.endWib } };
}

/** Relasi yang di-include: ATM, owner, & seluruh kegiatan urut waktu. */
export const lengkapTicketInclude = {
  atm: { select: { kodeAtm: true, namaAtm: true, cabang: true, alamat: true } },
  owner: { select: { nama: true } },
  activities: {
    orderBy: { waktu: "asc" },
    include: { user: { select: { nama: true } } },
  },
} satisfies Prisma.TicketInclude;

export type LengkapTicketRow = Prisma.TicketGetPayload<{
  include: typeof lengkapTicketInclude;
}>;

export interface LengkapActivity {
  waktu: Date;
  teks: string;
  petugas: string;
  isTindakLanjut: boolean;
}

export interface LengkapTicket {
  // --- Kolom penanda (1 sheet gabungan banyak shift & user) ---
  tanggal: string; // DD-MM-YYYY (WIB), dari waktuOpen (waktu kejadian)
  shiftKode: string; // openShiftKode (shift asal, immutable)
  shiftLabel: string; // "Shift Pagi", "Shift Sore", ...
  petugas: string; // nama owner (petugas yang open tiket)
  // --- Identitas tiket ---
  noTiket: string;
  kategori: string;
  // --- ATM ---
  atmKode: string;
  atmNama: string;
  atmLokasi: string;
  // --- Detail gangguan ---
  contactPerson: string; // "WAG" | "Nama (Telp)" | "-"
  jenisGangguan: string;
  sumberPenyebab: string;
  metodePenanganan: string;
  vendor: string;
  noTiketVendor: string;
  keterangan: string;
  // --- Waktu & status ---
  waktuOpen: Date;
  waktuResponInternal: Date | null;
  waktuSelesai: Date | null;
  status: TicketStatus;
  // --- Uraian kegiatan (urut waktu) ---
  activities: LengkapActivity[];
  // --- SLA (PRD §7) ---
  sla: SlaResult;
  slaLabel: string; // "Dalam Proses" | "99.86%"
}

/** Format DD-MM-YYYY dalam zona WIB. */
function fmtTanggalWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  })
    .format(d)
    .replace(/\//g, "-");
}

/** Label SLA siap-cetak: tiket selesai → persen; tiket proses → "Dalam Proses". */
export function slaLabel(sla: SlaResult): string {
  return sla.slaPersen === null ? "Dalam Proses" : formatSlaPersen(sla.slaPersen);
}

/** Contact Person siap-cetak (samakan laporan harian): WAG / "Nama (Telp)" / "-". */
function fmtContactPerson(
  tipe: string | null,
  nama: string | null,
  telp: string | null
): string {
  if (tipe === "wag") return "WAG";
  if (tipe === "pic") return `${nama ?? "-"}${telp ? ` (${telp})` : ""}`;
  return "-";
}

/** Map satu baris Prisma → entri dataset lengkap. */
export function mapLengkapTicket(t: LengkapTicketRow): LengkapTicket {
  // SLA dihitung hanya untuk tiket selesai (waktuSelesai terisi); tiket proses
  // → "Dalam Proses". waktuOpen = waktu kejadian (kolom C) sebagai basis.
  const waktuSelesai = t.status === "selesai" ? t.waktuSelesai : null;
  const sla = computeSla(t.waktuOpen, waktuSelesai);

  return {
    // Penanda shift memakai openShiftKode (shift ASAL, immutable) — bukan
    // shiftKode current yang dimutasi saat serah terima. Lihat reportQuery.ts.
    tanggal: fmtTanggalWIB(t.waktuOpen),
    shiftKode: t.openShiftKode,
    shiftLabel: SHIFT_NAMES[t.openShiftKode] ?? `Shift ${t.openShiftKode}`,
    petugas: t.owner.nama,
    noTiket: t.noTiket,
    kategori: t.kategori,
    atmKode: t.atm?.kodeAtm ?? "-",
    atmNama: t.atm?.namaAtm ?? "-",
    atmLokasi: t.atm?.alamat || t.atm?.cabang || "-",
    contactPerson: fmtContactPerson(t.cpTipe, t.cpNama, t.cpTelp),
    jenisGangguan: t.jenisGangguan ?? "-",
    sumberPenyebab: t.sumberPenyebab ?? "-",
    metodePenanganan: t.metodePenanganan ?? "-",
    vendor: t.vendor ?? "-",
    noTiketVendor: t.noTiketVendor ?? "-",
    keterangan: t.keterangan ?? "-",
    waktuOpen: t.waktuOpen,
    waktuResponInternal: t.waktuResponInternal,
    waktuSelesai,
    status: t.status,
    activities: t.activities.map((a) => ({
      waktu: a.waktu,
      teks: a.teks,
      petugas: a.user.nama,
      isTindakLanjut: a.isTindakLanjutFlag,
    })),
    sla,
    slaLabel: slaLabel(sla),
  };
}
