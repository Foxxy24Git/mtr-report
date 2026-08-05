import "server-only";
import { ShiftKode, TicketKategori, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveLeaderName } from "@/lib/reportSignatures";
import {
  butuhApprovalSupervisiNext,
  labelApproval,
  resolvePeranApproval,
  type LabelApproval,
  type PeranApproval,
} from "@/lib/shiftReportApproval";
import { activityMatchWindow } from "@/lib/shiftReportWindow";

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

/** Satu tiket lanjutan untuk notif & badge (bentuk ringkas). */
export interface TiketLanjutanItem {
  noTiket: string;
  kodeAtm: string;
  namaAtm: string;
}

/**
 * Tiket yang ditandai diteruskan ke shift berikutnya, untuk laporan shift
 * `shiftKode` yang ditutup pada `tanggal`.
 *
 * Kriterianya penanda aktivitas `isTindakLanjutFlag` pada shift yang SAMA —
 * bukan `status`, karena tiket bisa selesai di shift berikutnya namun tetap
 * merupakan lanjutan dari shift ini. Sengaja TIDAK memfilter lewat
 * `openShiftKode`/`waktuOpen` tiket: `openShiftKode` adalah shift ASAL tiket
 * dibuka dan tidak berubah walau tiket sudah diteruskan berkali-kali,
 * sehingga tiket lanjutan-dari-lanjutan akan salah terbuang bila dipakai
 * sebagai filter. Relasi `activities` (dibatasi jendela waktu sempit lewat
 * {@link activityMatchWindow}) sudah cukup untuk mencocokkan aktivitas ke
 * laporan ini, tanpa perlu asumsi hari kalender WIB penuh yang tidak berlaku
 * untuk shift malam (C/E) yang mulai sebelum tengah malam.
 */
export async function listTiketLanjutan(
  shiftKode: ShiftKode,
  tanggal: Date
): Promise<TiketLanjutanItem[]> {
  const { start, end } = activityMatchWindow(tanggal);
  const rows = await prisma.ticket.findMany({
    where: {
      activities: {
        some: { isTindakLanjutFlag: true, shiftKode, waktu: { gte: start, lte: end } },
      },
    },
    orderBy: { waktuOpen: "asc" },
    include: { atm: { select: { kodeAtm: true, namaAtm: true } } },
  });
  return rows.map((t) => ({
    noTiket: t.noTiket,
    kodeAtm: t.atm?.kodeAtm ?? "—",
    namaAtm: t.atm?.namaAtm ?? "—",
  }));
}

/** Jumlah tiket lanjutan — kriteria sama dengan {@link listTiketLanjutan}. */
export async function countTiketLanjutan(
  shiftKode: ShiftKode,
  tanggal: Date
): Promise<number> {
  const { start, end } = activityMatchWindow(tanggal);
  return prisma.ticket.count({
    where: {
      activities: {
        some: { isTindakLanjutFlag: true, shiftKode, waktu: { gte: start, lte: end } },
      },
    },
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
  supervisiNama: string | null;
  supervisiNextNama: string | null;
  approvedAt: Date | null;
  supervisiNextApprovedAt: Date | null;
  /** Peran viewer atas laporan ini — penentu tombol approve. */
  peran: PeranApproval;
  /** Label badge status gabungan (dual-gate). */
  label: LabelApproval;
  /** Jumlah tiket yang diteruskan ke shift berikutnya. */
  jmlTiketLanjutan: number;
}

export interface ShiftReportListFilter {
  /** Scope ke supervisi tertentu; null = semua laporan (superadmin). */
  supervisiId?: string | null;
  /**
   * Id user yang MELIHAT daftar — hanya untuk menghitung `peran` tiap baris.
   * Sengaja terpisah dari `supervisiId` yang mengatur SCOPING: superadmin
   * mengirim supervisiId null + viewerId sesi, sehingga ia melihat semua
   * laporan dengan peran null (tombol approve nonaktif).
   */
  viewerId?: string | null;
  /** pending | approved */
  status?: string | null;
  from?: Date | null;
  to?: Date | null;
}

export async function listShiftReports(
  f: ShiftReportListFilter
): Promise<ShiftReportListItem[]> {
  const where: Record<string, unknown> = {};
  if (f.supervisiId) {
    // Supervisi selanjutnya juga berhak melihat laporan shift malam yang
    // tiket lanjutannya menjadi tanggung jawab pemantauannya.
    where.OR = [
      { supervisiId: f.supervisiId },
      {
        supervisiNextId: f.supervisiId,
        shiftKode: { in: [ShiftKode.C, ShiftKode.E] },
      },
    ];
  }
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
      supervisi: { select: { nama: true } },
      supervisiNext: { select: { nama: true } },
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
      supervisiNama: r.supervisi?.nama ?? null,
      supervisiNextNama: r.supervisiNext?.nama ?? null,
      approvedAt: r.approvedAt,
      supervisiNextApprovedAt: r.supervisiNextApprovedAt,
      peran: f.viewerId ? resolvePeranApproval(r, f.viewerId) : null,
      label: labelApproval(r),
      jmlTiketLanjutan: butuhApprovalSupervisiNext(r)
        ? await countTiketLanjutan(r.shiftKode, r.tanggal)
        : 0,
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
  /** True bila tiket ini diteruskan ke shift berikutnya. */
  isLanjutan: boolean;
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
  supervisiNextId: string | null;
  supervisiNextNama: string | null;
  supervisiNextApproverNama: string | null;
  supervisiNextApprovedAt: Date | null;
  catatanSupervisiNext: string | null;
  label: LabelApproval;
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
      supervisiNext: { select: { nama: true } },
      supervisiNextApprover: { select: { nama: true } },
    },
  });
  if (!r) return null;

  const { start, end } = wibDayRange(r.tanggal);
  // Badge "Lanjutan" per-tiket dicocokkan lewat jendela waktu sempit di
  // sekitar penutupan laporan ini (bukan wibDayRange di atas), karena
  // shiftKode dipakai ulang tiap hari — tanpa jendela ini, aktivitas
  // isTindakLanjutFlag dari shiftKode yang sama di hari LAIN bisa salah
  // tertandai sebagai lanjutan laporan ini.
  const { start: lanjutanStart, end: lanjutanEnd } = activityMatchWindow(r.tanggal);
  const tickets = await prisma.ticket.findMany({
    where: { openShiftKode: r.shiftKode, waktuOpen: { gte: start, lt: end } },
    orderBy: { waktuOpen: "asc" },
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      activities: {
        where: {
          isTindakLanjutFlag: true,
          shiftKode: r.shiftKode,
          waktu: { gte: lanjutanStart, lte: lanjutanEnd },
        },
        select: { id: true },
        take: 1,
      },
    },
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
    supervisiNextId: r.supervisiNextId,
    supervisiNextNama: r.supervisiNext?.nama ?? null,
    supervisiNextApproverNama: r.supervisiNextApprover?.nama ?? null,
    supervisiNextApprovedAt: r.supervisiNextApprovedAt,
    catatanSupervisiNext: r.catatanSupervisiNext,
    label: labelApproval(r),
    tickets: tickets.map((t) => ({
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      status: t.status,
      waktuOpen: t.waktuOpen,
      waktuSelesai: t.waktuSelesai,
      isLanjutan: t.activities.length > 0,
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
