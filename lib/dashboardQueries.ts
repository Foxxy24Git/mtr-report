import "server-only";
import { prisma } from "@/lib/prisma";
import {
  Role,
  ShiftKode,
  StatusSupervisi,
  TicketKategori,
  TicketStatus,
} from "@prisma/client";
import { ALL_SHIFTS } from "@/lib/shift";
import { fmtDateKey } from "@/lib/format";

export interface KategoriCount {
  /** Total tiket open kategori ini (seluruh sistem). */
  total: number;
  /** Tiket open yang di-open oleh user yang sedang login. */
  mine: number;
  /** Tiket open yang dilanjutkan dari shift sebelumnya (punya penanda tindak lanjut). */
  lanjutan: number;
}

export interface DashboardOpenTicket {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  kodeAtm: string;
  namaAtm: string;
  shiftKode: ShiftKode;
  waktuOpen: Date;
  ownerNama: string;
  lanjutan: boolean;
}

export interface DashboardData {
  counts: {
    atm: KategoriCount;
    jaringan: KategoriCount;
  };
  /** Jumlah tiket open per shift A–E. */
  perShift: Record<ShiftKode, number>;
  /** Semua tiket open (untuk kalender & alert). */
  openTickets: DashboardOpenTicket[];
  generatedAt: string;
}

const OPEN = { status: TicketStatus.proses } as const;

/** Data agregat dashboard (PRD §4.A): kartu, kalender, indikator shift, alert. */
export async function getDashboardData(
  currentUserId: string
): Promise<DashboardData> {
  const [byKategori, byShift, mineByKategori, lanjutanByKategori, openRows] =
    await Promise.all([
      prisma.ticket.groupBy({
        by: ["kategori"],
        where: OPEN,
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["shiftKode"],
        where: OPEN,
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["kategori"],
        where: { ...OPEN, ownerUserId: currentUserId },
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["kategori"],
        where: {
          ...OPEN,
          activities: { some: { isTindakLanjutFlag: true } },
        },
        _count: { _all: true },
      }),
      prisma.ticket.findMany({
        where: OPEN,
        orderBy: { waktuOpen: "desc" },
        select: {
          id: true,
          noTiket: true,
          kategori: true,
          shiftKode: true,
          waktuOpen: true,
          owner: { select: { nama: true } },
          atm: { select: { kodeAtm: true, namaAtm: true } },
          _count: {
            select: { activities: { where: { isTindakLanjutFlag: true } } },
          },
        },
      }),
    ]);

  const total = (
    rows: { kategori: TicketKategori; _count: { _all: number } }[],
    k: TicketKategori
  ) => rows.find((r) => r.kategori === k)?._count._all ?? 0;

  const perShift = Object.fromEntries(
    ALL_SHIFTS.map((s) => [s, 0])
  ) as Record<ShiftKode, number>;
  for (const row of byShift) perShift[row.shiftKode] = row._count._all;

  return {
    counts: {
      atm: {
        total: total(byKategori, TicketKategori.atm),
        mine: total(mineByKategori, TicketKategori.atm),
        lanjutan: total(lanjutanByKategori, TicketKategori.atm),
      },
      jaringan: {
        total: total(byKategori, TicketKategori.jaringan),
        mine: total(mineByKategori, TicketKategori.jaringan),
        lanjutan: total(lanjutanByKategori, TicketKategori.jaringan),
      },
    },
    perShift,
    openTickets: openRows.map((t) => ({
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      shiftKode: t.shiftKode,
      waktuOpen: t.waktuOpen,
      ownerNama: t.owner.nama,
      lanjutan: t._count.activities > 0,
    })),
    generatedAt: new Date().toISOString(),
  };
}

// ----------------------------- Dashboard Supervisi -----------------------------

export interface SupervisiPendingTicket {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  kodeAtm: string;
  namaAtm: string;
  shiftKode: ShiftKode;
  status: TicketStatus;
  waktuOpen: Date;
  ownerNama: string;
}

export interface SupervisiDashboardData {
  /** Jumlah tiket belum approve milik supervisi ini, dipisah per kategori. */
  pending: { atm: number; jaringan: number; total: number };
  /** Daftar tiket belum approve (untuk kalender & daftar per tanggal). */
  pendingTickets: SupervisiPendingTicket[];
  generatedAt: string;
}

/**
 * Data Dashboard Supervisi (PRD revisi §4.A): tanpa selector shift. Hanya tiket
 * yang terikat ke supervisi ini (`supervisiId`) dan masih `belum` di-approve,
 * lintas seluruh user / shift / tanggal.
 */
export async function getSupervisiDashboardData(
  supervisiId: string
): Promise<SupervisiDashboardData> {
  const where = {
    supervisiId,
    statusSupervisi: StatusSupervisi.belum,
  } as const;

  const [byKategori, rows] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["kategori"],
      where,
      _count: { _all: true },
    }),
    prisma.ticket.findMany({
      where,
      orderBy: { waktuOpen: "desc" },
      select: {
        id: true,
        noTiket: true,
        kategori: true,
        shiftKode: true,
        status: true,
        waktuOpen: true,
        owner: { select: { nama: true } },
        atm: { select: { kodeAtm: true, namaAtm: true } },
      },
    }),
  ]);

  const count = (k: TicketKategori) =>
    byKategori.find((r) => r.kategori === k)?._count._all ?? 0;
  const atm = count(TicketKategori.atm);
  const jaringan = count(TicketKategori.jaringan);

  return {
    pending: { atm, jaringan, total: atm + jaringan },
    pendingTickets: rows.map((t) => ({
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      shiftKode: t.shiftKode,
      status: t.status,
      waktuOpen: t.waktuOpen,
      ownerNama: t.owner.nama,
    })),
    generatedAt: new Date().toISOString(),
  };
}

// ----------------------------- Dashboard Super Admin -----------------------------

export interface SuperAdminOpenTicket {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  kodeAtm: string;
  namaAtm: string;
  shiftKode: ShiftKode;
  waktuOpen: Date;
  ownerNama: string;
  statusSupervisi: StatusSupervisi;
}

export interface SuperAdminMember {
  id: string;
  nama: string;
  username: string;
  role: Role;
  currentShift: ShiftKode | null;
  lastLogin: Date | null;
}

export interface SuperAdminDashboardData {
  counts: {
    openTotal: number;
    openAtm: number;
    openJaringan: number;
    selesaiHariIni: number;
    memberUser: number;
    memberSupervisi: number;
  };
  /** Semua tiket open lintas user (tabel realtime + kalender). */
  openTickets: SuperAdminOpenTicket[];
  /** Semua user & supervisi aktif. */
  members: SuperAdminMember[];
  generatedAt: string;
}

/**
 * Data Dashboard Super Admin (PRD §1): metrik global, tabel tiket open semua
 * user, tabel member, dan tiket untuk kalender. Tanpa scoping owner/shift.
 */
export async function getSuperAdminDashboardData(): Promise<SuperAdminDashboardData> {
  // Rentang "hari ini" pada zona WIB untuk hitung tiket selesai.
  const todayKey = fmtDateKey(new Date());
  const startToday = new Date(`${todayKey}T00:00:00+07:00`);
  const endToday = new Date(startToday.getTime() + 24 * 60 * 60 * 1000);

  const [byKategori, selesaiHariIni, memberByRole, openRows, memberRows] =
    await Promise.all([
      prisma.ticket.groupBy({
        by: ["kategori"],
        where: OPEN,
        _count: { _all: true },
      }),
      prisma.ticket.count({
        where: {
          status: TicketStatus.selesai,
          waktuSelesai: { gte: startToday, lt: endToday },
        },
      }),
      prisma.user.groupBy({
        by: ["role"],
        where: { isAktif: true, role: { in: [Role.user, Role.supervisi] } },
        _count: { _all: true },
      }),
      prisma.ticket.findMany({
        where: OPEN,
        orderBy: { waktuOpen: "desc" },
        select: {
          id: true,
          noTiket: true,
          kategori: true,
          shiftKode: true,
          waktuOpen: true,
          statusSupervisi: true,
          owner: { select: { nama: true } },
          atm: { select: { kodeAtm: true, namaAtm: true } },
        },
      }),
      prisma.user.findMany({
        where: { isAktif: true, role: { in: [Role.user, Role.supervisi] } },
        orderBy: [{ role: "asc" }, { username: "asc" }],
        select: {
          id: true,
          nama: true,
          username: true,
          role: true,
          currentShift: true,
          lastLogin: true,
        },
      }),
    ]);

  const kat = (k: TicketKategori) =>
    byKategori.find((r) => r.kategori === k)?._count._all ?? 0;
  const role = (r: Role) =>
    memberByRole.find((m) => m.role === r)?._count._all ?? 0;
  const openAtm = kat(TicketKategori.atm);
  const openJaringan = kat(TicketKategori.jaringan);

  return {
    counts: {
      openTotal: openAtm + openJaringan,
      openAtm,
      openJaringan,
      selesaiHariIni,
      memberUser: role(Role.user),
      memberSupervisi: role(Role.supervisi),
    },
    openTickets: openRows.map((t) => ({
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      shiftKode: t.shiftKode,
      waktuOpen: t.waktuOpen,
      ownerNama: t.owner.nama,
      statusSupervisi: t.statusSupervisi,
    })),
    members: memberRows,
    generatedAt: new Date().toISOString(),
  };
}
