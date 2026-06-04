// Query & agregasi "Monitoring SLA" (menu BARU — Fase 1: backend).
//
// Mengagregasi tiket gangguan ATM & jaringan dalam satu rentang tanggal untuk
// dashboard SLA: ATM dengan SLA terendah, ATM paling sering bermasalah,
// pengelompokan per jenis gangguan / sumber penyebab, dan ringkasan umum.
//
// SLA di sini bersifat **periode** (rentang yang dipilih), berbeda dari SLA
// per-tiket bulanan di lib/sla.ts:
//   TotalMenitPeriode = jumlah_hari_rentang * 24 * 60
//   TotalDowntime     = akumulasi LamaMenit semua tiket SELESAI utk satu ATM
//   SLA%              = (TotalMenitPeriode - TotalDowntime) / TotalMenitPeriode
//
// Catatan ruang lingkup:
// - Rentang difilter via `waktuOpen` (waktu kejadian gangguan).
// - SLA & downtime hanya menghitung tiket status `selesai` (tiket `proses`
//   belum punya lama penanganan — PRD §7).
// - "Most trouble" menghitung SEMUA tiket (proses & selesai).

import type { Prisma, TicketKategori } from "@prisma/client";
import { prisma } from "./prisma";
import { computeSla, formatSlaPersen, menitToHHMM } from "./sla";

const TZ = "Asia/Jakarta";
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------- Filter & rentang -----------------------------

export type SlaKategori = "atm" | "jaringan" | "semua";

export interface SlaFilter {
  dari: string; // YYYY-MM-DD (WIB), inklusif
  sampai: string; // YYYY-MM-DD (WIB), inklusif
  kategori: SlaKategori;
}

export type ParsedSlaFilters =
  | { ok: true; filter: SlaFilter }
  | { ok: false; error: string };

/** Tanggal "hari ini" dalam zona WIB sebagai YYYY-MM-DD. */
function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Geser sebuah tanggal WIB (YYYY-MM-DD) sebanyak `delta` hari. */
function shiftDateWib(dateStr: string, delta: number): string {
  const base = new Date(`${dateStr}T00:00:00+07:00`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(base.getTime() + delta * DAY_MS));
}

/** Rentang default: 30 hari terakhir (inklusif) sampai hari ini (WIB). */
export function defaultRange(): { dari: string; sampai: string } {
  const sampai = todayWib();
  return { dari: shiftDateWib(sampai, -29), sampai };
}

/**
 * Parse & validasi query param `?dari=&sampai=&kategori=`.
 * - Tanpa dari & sampai → default 30 hari terakhir.
 * - Salah satu kosong → dilengkapi (sampai=hari ini / dari=sampai-29).
 */
export function parseSlaFilters(sp: URLSearchParams): ParsedSlaFilters {
  let dari = sp.get("dari") ?? "";
  let sampai = sp.get("sampai") ?? "";
  const kategoriRaw = sp.get("kategori") ?? "semua";

  if (!dari && !sampai) {
    const d = defaultRange();
    dari = d.dari;
    sampai = d.sampai;
  } else {
    if (!sampai) sampai = todayWib();
    if (!dari) dari = shiftDateWib(sampai, -29);
  }

  if (!DATE_RE.test(dari) || !DATE_RE.test(sampai)) {
    return { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." };
  }
  if (dari > sampai) {
    return {
      ok: false,
      error: "Tanggal 'dari' tidak boleh setelah tanggal 'sampai'.",
    };
  }
  if (kategoriRaw !== "atm" && kategoriRaw !== "jaringan" && kategoriRaw !== "semua") {
    return { ok: false, error: "Kategori harus atm | jaringan | semua." };
  }

  return { ok: true, filter: { dari, sampai, kategori: kategoriRaw } };
}

export interface SlaRange {
  startWib: Date;
  endWib: Date; // eksklusif (sehari setelah `sampai`)
  dayCount: number;
  totalMenitPeriode: number;
}

/** Rentang [start, end) WIB + jumlah hari & total menit periode. */
export function computeSlaRange(dari: string, sampai: string): SlaRange {
  const startWib = new Date(`${dari}T00:00:00+07:00`);
  const sampaiStart = new Date(`${sampai}T00:00:00+07:00`);
  const endWib = new Date(sampaiStart.getTime() + DAY_MS);
  const dayCount = Math.round((endWib.getTime() - startWib.getTime()) / DAY_MS);
  return { startWib, endWib, dayCount, totalMenitPeriode: dayCount * 24 * 60 };
}

/** Klausa where: rentang `waktuOpen` + filter kategori (+ opsional selesai). */
function buildWhere(
  range: SlaRange,
  kategori: SlaKategori,
  onlySelesai = false
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {
    waktuOpen: { gte: range.startWib, lt: range.endWib },
  };
  if (kategori !== "semua") where.kategori = kategori as TicketKategori;
  if (onlySelesai) where.status = "selesai";
  return where;
}

// ----------------------------- Helper ATM -----------------------------

const ticketSelect = {
  id: true,
  atmId: true,
  kategori: true,
  status: true,
  waktuOpen: true,
  waktuSelesai: true,
  atm: {
    select: {
      kodeAtm: true,
      namaAtm: true,
      cabang: true,
      alamat: true,
      vendorAtm: true,
      vendorJaringan: true,
    },
  },
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;
type AtmInfo = TicketRow["atm"];

const NO_ATM_KEY = "__none__";

function atmKey(t: TicketRow): string {
  return t.atmId ?? NO_ATM_KEY;
}
function atmKode(atm: AtmInfo): string {
  return atm?.kodeAtm ?? "-";
}
function atmNama(atm: AtmInfo): string {
  return atm?.namaAtm ?? "Tanpa ATM/Lokasi";
}
function atmLokasi(atm: AtmInfo): string {
  return atm?.alamat || atm?.cabang || atm?.namaAtm || "-";
}
function atmVendor(atm: AtmInfo): string {
  return atm?.vendorAtm || atm?.vendorJaringan || "-";
}

/** Downtime (menit) satu tiket — 0 bila belum selesai (PRD §7). */
function downtimeMenit(t: TicketRow): number {
  if (t.status !== "selesai") return 0;
  return computeSla(t.waktuOpen, t.waktuSelesai).lamaMenit ?? 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ----------------------------- 1. SLA terendah -----------------------------

export interface LowestSlaRow {
  atmId: string | null;
  kodeAtm: string;
  namaAtm: string;
  lokasi: string;
  vendor: string;
  kategori: TicketKategori | null;
  totalTiket: number;
  totalDowntimeMenit: number;
  slaPersen: number; // 0..1
  slaPersenLabel: string; // "99.86%"
}

export interface LowestSlaResponse {
  filter: SlaFilter;
  totalMenitPeriode: number;
  items: LowestSlaRow[];
}

export async function getLowestSla(filter: SlaFilter): Promise<LowestSlaResponse> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  const rows = await prisma.ticket.findMany({
    where: buildWhere(range, filter.kategori, true),
    select: ticketSelect,
  });

  const groups = new Map<
    string,
    { atm: AtmInfo; atmId: string | null; kategori: TicketKategori; tiket: number; downtime: number }
  >();
  for (const t of rows) {
    const key = atmKey(t);
    const g = groups.get(key);
    if (g) {
      g.tiket += 1;
      g.downtime += downtimeMenit(t);
    } else {
      groups.set(key, {
        atm: t.atm,
        atmId: t.atmId,
        kategori: t.kategori,
        tiket: 1,
        downtime: downtimeMenit(t),
      });
    }
  }

  const items: LowestSlaRow[] = [...groups.values()]
    .map((g) => {
      const sla = clamp01(
        (range.totalMenitPeriode - g.downtime) / range.totalMenitPeriode
      );
      return {
        atmId: g.atmId,
        kodeAtm: atmKode(g.atm),
        namaAtm: atmNama(g.atm),
        lokasi: atmLokasi(g.atm),
        vendor: atmVendor(g.atm),
        kategori: g.kategori,
        totalTiket: g.tiket,
        totalDowntimeMenit: g.downtime,
        slaPersen: sla,
        slaPersenLabel: formatSlaPersen(sla),
      };
    })
    .sort((a, b) => a.slaPersen - b.slaPersen)
    .slice(0, 20);

  return { filter, totalMenitPeriode: range.totalMenitPeriode, items };
}

// ----------------------------- 2. Paling bermasalah -----------------------------

export interface MostTroubleRow {
  atmId: string | null;
  kodeAtm: string;
  namaAtm: string;
  lokasi: string;
  vendor: string;
  kategori: TicketKategori | null;
  jumlahTiket: number;
  jumlahSelesai: number;
  jumlahProses: number;
}

export interface MostTroubleResponse {
  filter: SlaFilter;
  items: MostTroubleRow[];
}

export async function getMostTrouble(
  filter: SlaFilter
): Promise<MostTroubleResponse> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  // SEMUA tiket (proses & selesai).
  const rows = await prisma.ticket.findMany({
    where: buildWhere(range, filter.kategori, false),
    select: ticketSelect,
  });

  const groups = new Map<
    string,
    {
      atm: AtmInfo;
      atmId: string | null;
      kategori: TicketKategori;
      total: number;
      selesai: number;
      proses: number;
    }
  >();
  for (const t of rows) {
    const key = atmKey(t);
    const g =
      groups.get(key) ??
      (() => {
        const created = {
          atm: t.atm,
          atmId: t.atmId,
          kategori: t.kategori,
          total: 0,
          selesai: 0,
          proses: 0,
        };
        groups.set(key, created);
        return created;
      })();
    g.total += 1;
    if (t.status === "selesai") g.selesai += 1;
    else g.proses += 1;
  }

  const items: MostTroubleRow[] = [...groups.values()]
    .map((g) => ({
      atmId: g.atmId,
      kodeAtm: atmKode(g.atm),
      namaAtm: atmNama(g.atm),
      lokasi: atmLokasi(g.atm),
      vendor: atmVendor(g.atm),
      kategori: g.kategori,
      jumlahTiket: g.total,
      jumlahSelesai: g.selesai,
      jumlahProses: g.proses,
    }))
    .sort((a, b) => b.jumlahTiket - a.jumlahTiket)
    .slice(0, 20);

  return { filter, items };
}

// ----------------------------- 3 & 4. Pengelompokan kategori -----------------------------

export interface GroupCountRow {
  nilai: string;
  jumlah: number;
  persentase: number; // 0..1 dari total
}

export interface GroupCountResponse {
  filter: SlaFilter;
  total: number;
  items: GroupCountRow[];
}

async function countByField(
  filter: SlaFilter,
  field: "jenisGangguan" | "sumberPenyebab"
): Promise<GroupCountResponse> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  const grouped = await prisma.ticket.groupBy({
    by: [field],
    where: buildWhere(range, filter.kategori, false),
    _count: { _all: true },
  });

  const total = grouped.reduce((s, g) => s + g._count._all, 0);
  const items: GroupCountRow[] = grouped
    .map((g) => ({
      nilai: g[field] ?? "Tidak diisi",
      jumlah: g._count._all,
      persentase: total ? g._count._all / total : 0,
    }))
    .sort((a, b) => b.jumlah - a.jumlah);

  return { filter, total, items };
}

export function getByJenisGangguan(filter: SlaFilter): Promise<GroupCountResponse> {
  return countByField(filter, "jenisGangguan");
}

export function getBySumberPenyebab(filter: SlaFilter): Promise<GroupCountResponse> {
  return countByField(filter, "sumberPenyebab");
}

// ----------------------------- 5. Ringkasan umum -----------------------------

export interface SlaSummary {
  filter: SlaFilter;
  totalMenitPeriode: number;
  totalTiket: number;
  totalDowntimeMenit: number;
  /** Rata-rata SLA semua ATM (mean dari SLA per-ATM, 0..1). */
  rataSlaSemua: number;
  rataSlaSemuaLabel: string;
  atmBermasalah: number; // distinct ATM dgn >=1 tiket kategori atm
  jaringanBermasalah: number; // distinct lokasi dgn >=1 tiket kategori jaringan
  perKategori: {
    atm: { totalTiket: number; rataSla: number; rataSlaLabel: string };
    jaringan: { totalTiket: number; rataSla: number; rataSlaLabel: string };
  };
}

// ----------------------------- 6. Laporan Permasalahan (Fase 3) -----------------------------
//
// Rekap per-ATM untuk acuan koordinasi ke vendor. Berbeda dari "lowest" &
// "most-trouble": menggabungkan keduanya dalam SATU baris per ATM + jenis
// gangguan & sumber penyebab yang PALING SERING terjadi pada ATM tsb, lalu
// diurut sesuai pilihan pengguna (frekuensi tiket atau SLA terendah).

export type ProblemSortBy = "frekuensi" | "sla";

// Select tambahan: butuh jenisGangguan & sumberPenyebab (tak ada di ticketSelect).
const problemSelect = {
  atmId: true,
  kategori: true,
  status: true,
  waktuOpen: true,
  waktuSelesai: true,
  jenisGangguan: true,
  sumberPenyebab: true,
  atm: {
    select: {
      kodeAtm: true,
      namaAtm: true,
      cabang: true,
      alamat: true,
      vendorAtm: true,
      vendorJaringan: true,
    },
  },
} satisfies Prisma.TicketSelect;

type ProblemTicket = Prisma.TicketGetPayload<{ select: typeof problemSelect }>;

export interface ProblemRow {
  atmId: string | null;
  kodeAtm: string;
  namaAtm: string;
  lokasi: string;
  cabang: string;
  vendorAtm: string;
  vendorJaringan: string;
  kategori: TicketKategori | null;
  jumlahGangguan: number;
  jenisGangguanTersering: string;
  sumberPenyebabTersering: string;
  totalDowntimeMenit: number;
  totalDowntimeLabel: string; // "12:34" (hh:mm)
  slaPersen: number; // 0..1
  slaPersenLabel: string; // "99.86%"
}

export interface ProblemReportResponse {
  filter: SlaFilter;
  sortBy: ProblemSortBy;
  totalMenitPeriode: number;
  items: ProblemRow[];
}

/** Nilai dengan frekuensi tertinggi pada sebuah Map count (kosong → "-"). */
function topOf(counts: Map<string, number>): string {
  let best = "-";
  let bestN = 0;
  for (const [nilai, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = nilai;
    }
  }
  return best;
}

export async function getProblemReport(
  filter: SlaFilter,
  sortBy: ProblemSortBy
): Promise<ProblemReportResponse> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  // SEMUA tiket (proses & selesai) — frekuensi gangguan menghitung keduanya;
  // downtime/SLA tetap hanya dari tiket selesai (downtimeMenit()).
  const rows = (await prisma.ticket.findMany({
    where: buildWhere(range, filter.kategori, false),
    select: problemSelect,
  })) as ProblemTicket[];

  type Group = {
    atm: AtmInfo;
    atmId: string | null;
    kategori: TicketKategori;
    jumlah: number;
    downtime: number;
    jenis: Map<string, number>;
    sumber: Map<string, number>;
  };
  const groups = new Map<string, Group>();

  for (const t of rows) {
    const key = t.atmId ?? NO_ATM_KEY;
    let g = groups.get(key);
    if (!g) {
      g = {
        atm: t.atm,
        atmId: t.atmId,
        kategori: t.kategori,
        jumlah: 0,
        downtime: 0,
        jenis: new Map(),
        sumber: new Map(),
      };
      groups.set(key, g);
    }
    g.jumlah += 1;
    g.downtime += downtimeMenit(t as unknown as TicketRow);
    if (t.jenisGangguan) g.jenis.set(t.jenisGangguan, (g.jenis.get(t.jenisGangguan) ?? 0) + 1);
    if (t.sumberPenyebab)
      g.sumber.set(t.sumberPenyebab, (g.sumber.get(t.sumberPenyebab) ?? 0) + 1);
  }

  const items: ProblemRow[] = [...groups.values()].map((g) => {
    const sla = clamp01(
      (range.totalMenitPeriode - g.downtime) / range.totalMenitPeriode
    );
    return {
      atmId: g.atmId,
      kodeAtm: atmKode(g.atm),
      namaAtm: atmNama(g.atm),
      lokasi: atmLokasi(g.atm),
      cabang: g.atm?.cabang || "-",
      vendorAtm: g.atm?.vendorAtm || "-",
      vendorJaringan: g.atm?.vendorJaringan || "-",
      kategori: g.kategori,
      jumlahGangguan: g.jumlah,
      jenisGangguanTersering: topOf(g.jenis),
      sumberPenyebabTersering: topOf(g.sumber),
      totalDowntimeMenit: g.downtime,
      totalDowntimeLabel: menitToHHMM(g.downtime),
      slaPersen: sla,
      slaPersenLabel: formatSlaPersen(sla),
    };
  });

  // Urut sesuai jenis laporan; tie-break dengan metrik lainnya.
  items.sort((a, b) =>
    sortBy === "frekuensi"
      ? b.jumlahGangguan - a.jumlahGangguan || a.slaPersen - b.slaPersen
      : a.slaPersen - b.slaPersen || b.jumlahGangguan - a.jumlahGangguan
  );

  return { filter, sortBy, totalMenitPeriode: range.totalMenitPeriode, items };
}

export async function getSlaSummary(filter: SlaFilter): Promise<SlaSummary> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  const rows = await prisma.ticket.findMany({
    where: buildWhere(range, filter.kategori, false),
    select: ticketSelect,
  });

  // Akumulasi downtime per-ATM, dipisah per kategori untuk rata-rata kategori.
  type Acc = { downtime: number };
  const perAtm = new Map<string, Acc>();
  const perAtmAtm = new Map<string, Acc>();
  const perAtmJaringan = new Map<string, Acc>();

  let totalDowntime = 0;
  let totalAtm = 0;
  let totalJaringan = 0;

  const bump = (m: Map<string, Acc>, key: string, dt: number) => {
    const g = m.get(key);
    if (g) g.downtime += dt;
    else m.set(key, { downtime: dt });
  };

  for (const t of rows) {
    const key = atmKey(t);
    const dt = downtimeMenit(t);
    totalDowntime += dt;
    bump(perAtm, key, dt);
    if (t.kategori === "atm") {
      totalAtm += 1;
      bump(perAtmAtm, key, dt);
    } else {
      totalJaringan += 1;
      bump(perAtmJaringan, key, dt);
    }
  }

  const meanSla = (m: Map<string, Acc>): number => {
    if (m.size === 0) return 0;
    let sum = 0;
    for (const g of m.values()) {
      sum += clamp01(
        (range.totalMenitPeriode - g.downtime) / range.totalMenitPeriode
      );
    }
    return sum / m.size;
  };

  const rataSlaSemua = meanSla(perAtm);
  const rataSlaAtm = meanSla(perAtmAtm);
  const rataSlaJaringan = meanSla(perAtmJaringan);

  return {
    filter,
    totalMenitPeriode: range.totalMenitPeriode,
    totalTiket: rows.length,
    totalDowntimeMenit: totalDowntime,
    rataSlaSemua,
    rataSlaSemuaLabel: formatSlaPersen(rataSlaSemua),
    atmBermasalah: perAtmAtm.size,
    jaringanBermasalah: perAtmJaringan.size,
    perKategori: {
      atm: {
        totalTiket: totalAtm,
        rataSla: rataSlaAtm,
        rataSlaLabel: formatSlaPersen(rataSlaAtm),
      },
      jaringan: {
        totalTiket: totalJaringan,
        rataSla: rataSlaJaringan,
        rataSlaLabel: formatSlaPersen(rataSlaJaringan),
      },
    },
  };
}
