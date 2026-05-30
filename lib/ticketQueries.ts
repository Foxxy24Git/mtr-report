import "server-only";
import { prisma } from "@/lib/prisma";
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

  return tickets.map((t) => {
    const last = t.activities[0] ?? null;
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
    };
  });
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
