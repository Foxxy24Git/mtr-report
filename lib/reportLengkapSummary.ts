// Ringkasan statistik "Download Laporan Lengkap" (Fase 4).
//
// Agregasi PURE (tanpa I/O) atas dataset Fase 2 (LengkapTicket[]) → angka-angka
// ringkasan yang dicetak sebagai blok kartu di atas tabel detail Excel
// (lib/excelReportLengkap.ts). Dipisah agar mudah diuji unit & dipakai script.

import { SHIFT_NAMES } from "./constants";
import type { LengkapTicket } from "./reportLengkapQuery";

/** Urutan kanonik shift untuk rekap (selalu tampil A..E walau 0). */
const SHIFT_ORDER = ["A", "B", "C", "D", "E"] as const;

export interface ShiftCount {
  kode: string;
  label: string;
  jumlah: number;
}

export interface PetugasCount {
  petugas: string;
  jumlah: number;
}

export interface GangguanCount {
  jenis: string;
  jumlah: number;
}

export interface LengkapSummary {
  total: number;
  atm: number;
  jaringan: number;
  selesai: number;
  proses: number;
  /** Rata-rata SLA tiket selesai (pecahan 0..1). null bila tak ada yang selesai. */
  avgSlaPersen: number | null;
  /** Rata-rata lama penanganan tiket selesai (menit). null bila tak ada. */
  avgLamaMenit: number | null;
  /** "X jam Y menit" (atau "-" bila tak ada tiket selesai). */
  avgLamaLabel: string;
  /** Kelima shift berurutan A..E dengan jumlahnya. */
  perShift: ShiftCount[];
  /** Per petugas, urut jumlah desc lalu nama asc. */
  perPetugas: PetugasCount[];
  /** Maksimal 5 jenis gangguan terbanyak, urut jumlah desc. */
  topGangguan: GangguanCount[];
}

/** "120" menit → "2 jam 0 menit". */
function fmtLama(menit: number): string {
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;
  return `${jam} jam ${sisa} menit`;
}

/** Hitung seluruh angka ringkasan dari dataset gabungan. */
export function buildLengkapSummary(tickets: LengkapTicket[]): LengkapSummary {
  let atm = 0;
  let selesai = 0;
  let slaSum = 0;
  let slaN = 0;
  let lamaSum = 0;
  let lamaN = 0;

  const shiftMap = new Map<string, number>();
  const petugasMap = new Map<string, number>();
  const gangguanMap = new Map<string, number>();

  for (const t of tickets) {
    if (t.kategori === "atm") atm += 1;

    if (t.status === "selesai") {
      selesai += 1;
      if (t.sla.slaPersen !== null) {
        slaSum += t.sla.slaPersen;
        slaN += 1;
      }
      if (t.sla.lamaMenit !== null) {
        lamaSum += t.sla.lamaMenit;
        lamaN += 1;
      }
    }

    shiftMap.set(t.shiftKode, (shiftMap.get(t.shiftKode) ?? 0) + 1);
    petugasMap.set(t.petugas, (petugasMap.get(t.petugas) ?? 0) + 1);

    const jenis = (t.jenisGangguan ?? "").trim();
    if (jenis && jenis !== "-") {
      gangguanMap.set(jenis, (gangguanMap.get(jenis) ?? 0) + 1);
    }
  }

  const total = tickets.length;
  const avgLamaMenit = lamaN > 0 ? Math.round(lamaSum / lamaN) : null;

  const perShift: ShiftCount[] = SHIFT_ORDER.map((kode) => ({
    kode,
    label: SHIFT_NAMES[kode] ?? `Shift ${kode}`,
    jumlah: shiftMap.get(kode) ?? 0,
  }));

  const perPetugas: PetugasCount[] = [...petugasMap.entries()]
    .map(([petugas, jumlah]) => ({ petugas, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah || a.petugas.localeCompare(b.petugas));

  const topGangguan: GangguanCount[] = [...gangguanMap.entries()]
    .map(([jenis, jumlah]) => ({ jenis, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah || a.jenis.localeCompare(b.jenis))
    .slice(0, 5);

  return {
    total,
    atm,
    jaringan: total - atm,
    selesai,
    proses: total - selesai,
    avgSlaPersen: slaN > 0 ? slaSum / slaN : null,
    avgLamaMenit,
    avgLamaLabel: avgLamaMenit === null ? "-" : fmtLama(avgLamaMenit),
    perShift,
    perPetugas,
    topGangguan,
  };
}
