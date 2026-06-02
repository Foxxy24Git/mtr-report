import "server-only";
import { prisma } from "@/lib/prisma";
import { computeSla } from "@/lib/sla";
import {
  buildShiftReportStatusMap,
  ticketShiftReportKey,
} from "@/lib/shiftReportQueries";
import { ShiftKode, TicketKategori, TicketStatus } from "@prisma/client";

const KATEGORI = Object.values(TicketKategori) as string[];
const SHIFTS = Object.values(ShiftKode) as string[];

export interface TicketListFilter {
  kategori?: string | null;
  shift?: string | null;
  /** mine | lanjutan | all */
  scope?: string | null;
  /** proses | selesai | all */
  status?: string | null;
  /** belum | approved | all */
  statusSupervisi?: string | null;
  currentUserId: string;
  /**
   * Scope menu Supervisi (PRD revisi §4): bila diisi, hanya tampilkan tiket
   * yang terikat ke supervisi ini (supervisiId = nilai ini). Diisi dengan id
   * user supervisi yang login; superadmin TIDAK mengisi (melihat semua tiket).
   */
  supervisiId?: string | null;
  /**
   * Mode Daily Monitoring (PRD revisi §4.B).
   * Bila true, tampilkan SEMUA tiket (proses & selesai) yang menjadi tanggung
   * jawab user pada shift session yang sedang berjalan:
   * shiftKode = currentShift DAN
   * (ownerUserId = currentUserId pada shift session ini  ATAU
   *  tiket diteruskan ke shift ini via tindak lanjut/handover).
   * Tiket hilang hanya saat shift berakhir (serah terima) atau user logout —
   * keduanya mengosongkan shift sesi sehingga query mengembalikan [].
   */
  dailyMonitoring?: boolean;
  /** Shift aktif sesi user (A–E). Wajib bila dailyMonitoring=true. */
  currentShift?: string | null;
  /** Awal shift session (ISO). Membatasi tiket milik user pada sesi ini. */
  shiftStartedAt?: string | null;
}

export interface TicketListItem {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  waktuOpen: Date;
  status: TicketStatus;
  statusSupervisi: string;
  shiftKode: ShiftKode;
  kodeAtm: string;
  namaAtm: string;
  ownerNama: string;
  lanjutan: boolean;
  lastTeks: string | null;
  lastWaktu: Date | null;
  lastPic: string | null;
  vendor: string | null;
  noTiketVendor: string | null;
  /** Status supervisi laporan shift (pending | approved) — PART 5. */
  supervisiStatus: string;
  /** Nama supervisi (approver bila sudah, jika tidak yang ditugaskan). */
  supervisiNama: string | null;
}

/** Query daftar tiket Daily Monitoring (dipakai API route & server page). */
export async function listTickets(
  f: TicketListFilter
): Promise<TicketListItem[]> {
  const where: Record<string, unknown> = {};
  if (f.kategori && KATEGORI.includes(f.kategori)) where.kategori = f.kategori;

  if (f.dailyMonitoring) {
    // Tanpa shift session aktif (belum pilih shift / sudah serah terima /
    // logout) Daily Monitoring kosong (PRD revisi §4.B).
    if (!f.currentShift || !SHIFTS.includes(f.currentShift)) return [];

    // Tiket sendiri pada shift session ini dibatasi sejak shift dimulai,
    // agar tiket lama dari shift bernama sama (sesi sebelumnya) tidak muncul.
    const startedAt = f.shiftStartedAt ? new Date(f.shiftStartedAt) : null;
    const mineWhere: Record<string, unknown> = { ownerUserId: f.currentUserId };
    if (startedAt && !Number.isNaN(startedAt.getTime())) {
      mineWhere.waktuOpen = { gte: startedAt };
    }

    // Tampilkan tiket (proses & selesai) di shift aktif yang menjadi tanggung
    // jawab user — tiket sendiri pada sesi ini ATAU tiket tindak lanjut dari
    // shift sebelumnya. Tidak ada filter status: tiket close tetap tampil
    // selama shift masih berjalan.
    where.shiftKode = f.currentShift;
    where.OR = [
      mineWhere,
      { activities: { some: { isTindakLanjutFlag: true } } },
    ];
  } else {
    if (f.shift && SHIFTS.includes(f.shift)) where.shiftKode = f.shift;
    if (f.status === "proses" || f.status === "selesai") where.status = f.status;
    if (f.scope === "mine") where.ownerUserId = f.currentUserId;
    else if (f.scope === "lanjutan")
      where.activities = { some: { isTindakLanjutFlag: true } };
  }

  if (f.statusSupervisi === "belum" || f.statusSupervisi === "approved")
    where.statusSupervisi = f.statusSupervisi;

  // Supervisi hanya melihat tiket yang diikat ke dirinya (status proses &
  // selesai). Superadmin tidak mengisi supervisiId → tetap melihat semua.
  if (f.supervisiId) where.supervisiId = f.supervisiId;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { waktuOpen: "desc" },
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      owner: { select: { nama: true } },
      _count: {
        select: { activities: { where: { isTindakLanjutFlag: true } } },
      },
      activities: {
        orderBy: { waktu: "desc" },
        take: 1,
        select: { teks: true, waktu: true, user: { select: { nama: true } } },
      },
    },
  });

  const statusMap = await buildShiftReportStatusMapForTickets(tickets);

  return tickets.map((t) => {
    const last = t.activities[0] ?? null;
    const sr = statusMap.get(ticketShiftReportKey(t.openShiftKode, t.waktuOpen));
    return {
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      waktuOpen: t.waktuOpen,
      status: t.status,
      statusSupervisi: t.statusSupervisi,
      shiftKode: t.shiftKode,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      ownerNama: t.owner.nama,
      lanjutan: t._count.activities > 0,
      lastTeks: last?.teks ?? null,
      lastWaktu: last?.waktu ?? null,
      lastPic: last?.user.nama ?? null,
      vendor: t.vendor,
      noTiketVendor: t.noTiketVendor,
      supervisiStatus: sr?.status ?? "pending",
      supervisiNama: sr?.supervisiNama ?? null,
    };
  });
}

/**
 * Bangun peta status supervisi laporan shift untuk sekumpulan tiket, dengan
 * rentang tanggal turunan dari `waktuOpen` tiket (untuk dipakai listTickets &
 * listWeeklyTickets). Mengembalikan peta kosong bila tidak ada tiket.
 */
async function buildShiftReportStatusMapForTickets(
  tickets: { waktuOpen: Date }[]
) {
  if (tickets.length === 0) {
    return new Map<string, { status: string; supervisiNama: string | null }>();
  }
  let min = tickets[0].waktuOpen;
  let max = tickets[0].waktuOpen;
  for (const t of tickets) {
    if (t.waktuOpen < min) min = t.waktuOpen;
    if (t.waktuOpen > max) max = t.waktuOpen;
  }
  // Lebarkan ke akhir hari max agar laporan shift hari itu ikut tercakup.
  const to = new Date(max.getTime() + 86_400_000);
  return buildShiftReportStatusMap({ from: min, to });
}

export interface WeeklyTicketFilter {
  /** Batas awal rentang (ISO instant). Default 7 hari ke belakang dipakai route. */
  from: Date;
  /** Batas akhir rentang (ISO instant). */
  to: Date;
  kategori?: string | null;
  /** proses | selesai | all */
  status?: string | null;
  shift?: string | null;
  /** Filter owner/PIC berdasar id user. */
  ownerUserId?: string | null;
  /** belum | approved | all — filter status supervisi (PRD revisi §4.3). */
  statusSupervisi?: string | null;
  /** Filter satu ATM (id master) untuk track riwayat permasalahan ATM. */
  atmId?: string | null;
  /** Filter vendor (nilai persis). */
  vendor?: string | null;
  /**
   * Cari (real-time) berdasar no tiket, kode/lokasi ATM, vendor, no tiket
   * vendor, atau teks kegiatan penanganan (isi log kronologis). PRD revisi §4.2.
   */
  search?: string | null;
}

export interface WeeklyTicketItem {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  waktuOpen: Date;
  waktuSelesai: Date | null;
  status: TicketStatus;
  statusSupervisi: string;
  shiftKode: ShiftKode;
  kodeAtm: string;
  namaAtm: string;
  ownerNama: string;
  vendor: string | null;
  noTiketVendor: string | null;
  /** Status supervisi laporan shift (pending | approved) — PART 5. */
  supervisiStatus: string;
  supervisiNama: string | null;
}

/**
 * Query Weekly Monitoring (menu baru): SELURUH tiket dalam rentang tanggal
 * (default 7 hari rolling) lintas user & shift, status proses maupun selesai,
 * urut terbaru di atas (waktuOpen DESC). Murni baca — tanpa mutasi.
 */
export async function listWeeklyTickets(
  f: WeeklyTicketFilter
): Promise<WeeklyTicketItem[]> {
  const where: Record<string, unknown> = {
    waktuOpen: { gte: f.from, lte: f.to },
  };
  if (f.kategori && KATEGORI.includes(f.kategori)) where.kategori = f.kategori;
  if (f.status === "proses" || f.status === "selesai") where.status = f.status;
  if (f.shift && SHIFTS.includes(f.shift)) where.shiftKode = f.shift;
  if (f.ownerUserId) where.ownerUserId = f.ownerUserId;
  if (f.statusSupervisi === "belum" || f.statusSupervisi === "approved")
    where.statusSupervisi = f.statusSupervisi;
  if (f.atmId) where.atmId = f.atmId;
  if (f.vendor?.trim()) where.vendor = f.vendor.trim();

  const search = f.search?.trim();
  if (search) {
    where.OR = [
      { noTiket: { contains: search, mode: "insensitive" } },
      { atm: { kodeAtm: { contains: search, mode: "insensitive" } } },
      { atm: { namaAtm: { contains: search, mode: "insensitive" } } },
      { vendor: { contains: search, mode: "insensitive" } },
      { noTiketVendor: { contains: search, mode: "insensitive" } },
      { activities: { some: { teks: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { waktuOpen: "desc" },
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      owner: { select: { nama: true } },
    },
  });

  const statusMap = await buildShiftReportStatusMap({ from: f.from, to: f.to });

  return tickets.map((t) => {
    const sr = statusMap.get(ticketShiftReportKey(t.openShiftKode, t.waktuOpen));
    return {
      id: t.id,
      noTiket: t.noTiket,
      kategori: t.kategori,
      waktuOpen: t.waktuOpen,
      waktuSelesai: t.waktuSelesai,
      status: t.status,
      statusSupervisi: t.statusSupervisi,
      shiftKode: t.shiftKode,
      kodeAtm: t.atm?.kodeAtm ?? "—",
      namaAtm: t.atm?.namaAtm ?? "—",
      ownerNama: t.owner.nama,
      vendor: t.vendor,
      noTiketVendor: t.noTiketVendor,
      supervisiStatus: sr?.status ?? "pending",
      supervisiNama: sr?.supervisiNama ?? null,
    };
  });
}

/**
 * Total tiket pada rentang tanggal (tanpa filter lain) — dipakai untuk
 * menampilkan "Menampilkan X dari Y total" di Weekly Monitoring (PRD §4.5).
 */
export async function countWeeklyTickets(range: {
  from: Date;
  to: Date;
}): Promise<number> {
  return prisma.ticket.count({
    where: { waktuOpen: { gte: range.from, lte: range.to } },
  });
}

export interface AtmHistory {
  /** Total tiket pernah open untuk ATM ini (sepanjang data). */
  total: number;
  /** Jenis gangguan terbanyak + jumlah kemunculan. */
  topGangguan: { nilai: string; count: number } | null;
  /** Rata-rata SLA (pecahan 0..1) atas tiket yang sudah selesai. */
  avgSlaPersen: number | null;
  /** Rata-rata lama penanganan (menit) atas tiket yang sudah selesai. */
  avgLamaMenit: number | null;
  /** Jumlah tiket selesai yang dihitung untuk rata-rata SLA. */
  selesaiCount: number;
}

/**
 * Ringkasan riwayat satu ATM (PRD revisi §4.7): total tiket sepanjang data,
 * jenis gangguan terbanyak, dan rata-rata SLA/lama penanganan. Berguna untuk
 * mengidentifikasi ATM yang sering bermasalah.
 */
export async function getAtmHistory(atmId: string): Promise<AtmHistory> {
  const tickets = await prisma.ticket.findMany({
    where: { atmId },
    select: {
      jenisGangguan: true,
      waktuOpen: true,
      waktuSelesai: true,
      status: true,
    },
  });

  const counts = new Map<string, number>();
  for (const t of tickets) {
    const g = t.jenisGangguan?.trim();
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let topGangguan: AtmHistory["topGangguan"] = null;
  for (const [nilai, count] of counts) {
    if (!topGangguan || count > topGangguan.count) topGangguan = { nilai, count };
  }

  let sumSla = 0;
  let sumLama = 0;
  let selesaiCount = 0;
  for (const t of tickets) {
    if (t.status === "selesai" && t.waktuSelesai) {
      const sla = computeSla(t.waktuOpen, t.waktuSelesai);
      if (sla.slaPersen != null && sla.lamaMenit != null) {
        sumSla += sla.slaPersen;
        sumLama += sla.lamaMenit;
        selesaiCount += 1;
      }
    }
  }

  return {
    total: tickets.length,
    topGangguan,
    avgSlaPersen: selesaiCount > 0 ? sumSla / selesaiCount : null,
    avgLamaMenit: selesaiCount > 0 ? Math.round(sumLama / selesaiCount) : null,
    selesaiCount,
  };
}

export interface TicketActivityItem {
  id: string;
  waktu: Date;
  teks: string;
  isTindakLanjutFlag: boolean;
  shiftKode: ShiftKode;
  userId: string;
  userNama: string;
  editedAt: Date | null;
  editedByNama: string | null;
}

export interface TicketDetail {
  id: string;
  noTiket: string;
  kategori: TicketKategori;
  status: TicketStatus;
  statusSupervisi: string;
  approverNama: string | null;
  approvedAt: Date | null;
  waktuOpen: Date;
  waktuSelesai: Date | null;
  waktuResponInternal: Date | null;
  cpTipe: string | null;
  cpNama: string | null;
  cpTelp: string | null;
  jenisGangguan: string | null;
  sumberPenyebab: string | null;
  metodePenanganan: string | null;
  vendor: string | null;
  noTiketVendor: string | null;
  keterangan: string | null;
  shiftKode: ShiftKode;
  ownerId: string;
  ownerNama: string;
  supervisiId: string | null;
  pimpinanInfraId: string | null;
  pimpinanDivisiId: string | null;
  pimpinanInfraNama: string | null;
  pimpinanDivisiNama: string | null;
  atm: {
    kodeAtm: string;
    namaAtm: string;
    cabang: string | null;
    alamat: string | null;
    vendorAtm: string | null;
    vendorJaringan: string | null;
  } | null;
  activities: TicketActivityItem[];
}

/** Detail satu tiket beserta kronologi kegiatan (urut waktu). */
export async function getTicketDetail(id: string): Promise<TicketDetail | null> {
  const t = await prisma.ticket.findUnique({
    where: { id },
    include: {
      atm: true,
      owner: { select: { id: true, nama: true } },
      approver: { select: { nama: true } },
      pimpinanInfra: { select: { nama: true } },
      pimpinanDivisi: { select: { nama: true } },
      activities: {
        orderBy: { waktu: "asc" },
        include: {
          user: { select: { nama: true } },
          editor: { select: { nama: true } },
        },
      },
    },
  });
  if (!t) return null;

  return {
    id: t.id,
    noTiket: t.noTiket,
    kategori: t.kategori,
    status: t.status,
    statusSupervisi: t.statusSupervisi,
    approverNama: t.approver?.nama ?? null,
    approvedAt: t.approvedAt,
    waktuOpen: t.waktuOpen,
    waktuSelesai: t.waktuSelesai,
    waktuResponInternal: t.waktuResponInternal,
    cpTipe: t.cpTipe,
    cpNama: t.cpNama,
    cpTelp: t.cpTelp,
    jenisGangguan: t.jenisGangguan,
    sumberPenyebab: t.sumberPenyebab,
    metodePenanganan: t.metodePenanganan,
    vendor: t.vendor,
    noTiketVendor: t.noTiketVendor,
    keterangan: t.keterangan,
    shiftKode: t.shiftKode,
    ownerId: t.owner.id,
    ownerNama: t.owner.nama,
    supervisiId: t.supervisiId,
    pimpinanInfraId: t.pimpinanInfraId,
    pimpinanDivisiId: t.pimpinanDivisiId,
    pimpinanInfraNama: t.pimpinanInfra?.nama ?? null,
    pimpinanDivisiNama: t.pimpinanDivisi?.nama ?? null,
    atm: t.atm
      ? {
          kodeAtm: t.atm.kodeAtm,
          namaAtm: t.atm.namaAtm,
          cabang: t.atm.cabang,
          alamat: t.atm.alamat,
          vendorAtm: t.atm.vendorAtm,
          vendorJaringan: t.atm.vendorJaringan,
        }
      : null,
    activities: t.activities.map((a) => ({
      id: a.id,
      waktu: a.waktu,
      teks: a.teks,
      isTindakLanjutFlag: a.isTindakLanjutFlag,
      shiftKode: a.shiftKode,
      userId: a.userId,
      userNama: a.user.nama,
      editedAt: a.editedAt,
      editedByNama: a.editor?.nama ?? null,
    })),
  };
}
