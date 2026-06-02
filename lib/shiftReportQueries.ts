import "server-only";
import { ShiftKode, TicketKategori, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveLeaderName } from "@/lib/reportSignatures";

const TZ = "Asia/Jakarta";

/** Kunci tanggal WIB (YYYY-MM-DD) dari sebuah instant. */
export function dateKeyWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Rentang hari WIB [start, end) yang memuat `tanggal`. */
function wibDayRange(tanggal: Date): { start: Date; end: Date } {
  const key = dateKeyWIB(tanggal);
  const start = new Date(`${key}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/**
 * Kunci pencocokan tiket → laporan shift: tiket masuk ke laporan shift yang
 * `shift_kode` & hari-WIB-nya cocok dengan `openShiftKode` (shift asal,
 * immutable) + `waktuOpen` tiket. Selaras dengan scope laporan harian Excel.
 */
export function ticketShiftReportKey(openShiftKode: string, waktuOpen: Date): string {
  return `${dateKeyWIB(waktuOpen)}|${openShiftKode}`;
}

/** Hitung tiket pada shift+hari sebuah laporan (scope laporan harian Excel). */
export async function countTicketsForShiftDay(
  shiftKode: ShiftKode,
  tanggal: Date
): Promise<number> {
  const { start, end } = wibDayRange(tanggal);
  return prisma.ticket.count({
    where: { openShiftKode: shiftKode, waktuOpen: { gte: start, lt: end } },
  });
}

// ----------------------------- Daftar laporan shift -----------------------------

export interface ShiftReportListItem {
  id: string;
  tanggal: Date;
  shiftKode: ShiftKode;
  shiftLabel: string;
  ownerNama: string;
  receiverNama: string | null;
  status: string;
  approverNama: string | null;
  jmlTiket: number;
}

export interface ShiftReportListFilter {
  /** Scope ke supervisi tertentu; null = semua laporan (superadmin). */
  supervisiId?: string | null;
  /** pending | approved */
  status?: string | null;
  from?: Date | null;
  to?: Date | null;
}

export async function listShiftReports(
  f: ShiftReportListFilter
): Promise<ShiftReportListItem[]> {
  const where: Record<string, unknown> = {};
  if (f.supervisiId) where.supervisiId = f.supervisiId;
  if (f.status === "pending" || f.status === "approved") where.status = f.status;
  if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.gte = f.from;
    if (f.to) range.lte = f.to;
    where.tanggal = range;
  }

  const rows = await prisma.shiftReport.findMany({
    where,
    orderBy: { tanggal: "desc" },
    include: {
      ownerUser: { select: { nama: true } },
      receiverUser: { select: { nama: true } },
      approver: { select: { nama: true } },
    },
  });

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      tanggal: r.tanggal,
      shiftKode: r.shiftKode,
      shiftLabel: r.shiftLabel,
      ownerNama: r.ownerUser.nama,
      receiverNama: r.receiverUser?.nama ?? null,
      status: r.status,
      approverNama: r.approver?.nama ?? null,
      jmlTiket: await countTicketsForShiftDay(r.shiftKode, r.tanggal),
    }))
  );
}

// ----------------------------- Detail laporan shift -----------------------------

export interface ShiftReportDetailTicket {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  kodeAtm: string;
  namaAtm: string;
  status: TicketStatus;
  waktuOpen: Date;
  waktuSelesai: Date | null;
}

export interface ShiftReportDetail {
  id: string;
  tanggal: Date;
  shiftKode: ShiftKode;
  shiftLabel: string;
  ownerNama: string;
  receiverNama: string | null;
  supervisiId: string | null;
  supervisiNama: string | null;
  pimpinanInfra: string;
  pimpinanDivisi: string;
  status: string;
  approverNama: string | null;
  approvedAt: Date | null;
  catatanSupervisi: string | null;
  tickets: ShiftReportDetailTicket[];
}

export async function getShiftReportDetail(
  id: string
): Promise<ShiftReportDetail | null> {
  const r = await prisma.shiftReport.findUnique({
    where: { id },
    include: {
      ownerUser: { select: { nama: true } },
      receiverUser: { select: { nama: true } },
      supervisi: { select: { nama: true } },
      approver: { select: { nama: true } },
      pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
      pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
    },
  });
  if (!r) return null;

  const { start, end } = wibDayRange(r.tanggal);
  const tickets = await prisma.ticket.findMany({
    where: { openShiftKode: r.shiftKode, waktuOpen: { gte: start, lt: end } },
    orderBy: { waktuOpen: "asc" },
    include: { atm: { select: { kodeAtm: true, namaAtm: true } } },
  });

  return {
    id: r.id,
    tanggal: r.tanggal,
    shiftKode: r.shiftKode,
    shiftLabel: r.shiftLabel,
    ownerNama: r.ownerUser.nama,
    receiverNama: r.receiverUser?.nama ?? null,
    supervisiId: r.supervisiId,
    supervisiNama: r.supervisi?.nama ?? null,
    pimpinanInfra: resolveLeaderName(r.pimpinanInfra),
    pimpinanDivisi: resolveLeaderName(r.pimpinanDivisi),
    status: r.status,
    approverNama: r.approver?.nama ?? null,
    approvedAt: r.approvedAt,
    catatanSupervisi: r.catatanSupervisi,
    tickets: tickets.map((t) => ({
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      status: t.status,
      waktuOpen: t.waktuOpen,
      waktuSelesai: t.waktuSelesai,
    })),
  };
}

// ----------------------------- Status supervisi per tiket -----------------------------

export interface TicketSupervisiStatus {
  status: string; // pending | approved
  supervisiNama: string | null;
}

/**
 * Peta `${tanggalWIB}|${shiftKode}` → status supervisi laporan shift, untuk
 * kolom "Status Supervisi" Daily/Weekly Monitoring (PART 5). Bila satu shift+hari
 * punya >1 laporan, dipakai yang terbaru (createdAt desc).
 */
export async function buildShiftReportStatusMap(range: {
  from: Date;
  to: Date;
}): Promise<Map<string, TicketSupervisiStatus>> {
  const reports = await prisma.shiftReport.findMany({
    where: { tanggal: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: "desc" },
    include: {
      approver: { select: { nama: true } },
      supervisi: { select: { nama: true } },
    },
  });

  const map = new Map<string, TicketSupervisiStatus>();
  for (const r of reports) {
    const key = `${dateKeyWIB(r.tanggal)}|${r.shiftKode}`;
    if (!map.has(key)) {
      map.set(key, {
        status: r.status,
        supervisiNama: r.approver?.nama ?? r.supervisi?.nama ?? null,
      });
    }
  }
  return map;
}
