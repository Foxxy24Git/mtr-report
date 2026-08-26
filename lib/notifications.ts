import "server-only";
import { Prisma, TicketKategori } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/jwt";

export interface NotificationListItem {
  id: string;
  ticketId: string;
  noTiket: string;
  message: string;
  createdAt: Date;
  isRead: boolean;
}

const LIST_TAKE = 20;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function buildSupervisiActivityMessage(
  supervisiNama: string,
  teks: string
): string {
  return `Supervisi ${supervisiNama} menambahkan kegiatan: "${truncate(teks, 80)}"`;
}

export function buildTicketOpenedMessage(
  petugasNama: string,
  kategori: TicketKategori
): string {
  const label = kategori === TicketKategori.atm ? "ATM" : "Jaringan";
  return `Petugas ${petugasNama} membuka tiket baru (${label})`;
}

/**
 * Where-clause scope notifikasi per role. Null berarti role ini tidak punya
 * jalur notifikasi (superadmin) — selalu kosong.
 * - user (petugas): dibatasi createdAt >= shiftStartedAt sesi ini — begitu
 *   serah terima/tutup shift (shiftStartedAt kosong/berubah), notif lama
 *   otomatis tidak ikut lagi.
 * - supervisi: live join ke ticket.owner.currentSupervisiId — begitu petugas
 *   ganti/lepas Supervisi (atau serah terima yang mengosongkannya), notif
 *   lama otomatis tidak lagi cocok, tanpa job pembersihan terpisah.
 */
function scopeWhere(
  session: SessionPayload
): Prisma.NotificationWhereInput | null {
  if (session.role === "user") {
    // revisi_diminta sengaja TIDAK digate oleh shiftStartedAt seperti
    // supervisi_update_kegiatan — permintaan revisi harus tetap terlihat
    // walau petugas belum/sudah tidak punya sesi shift aktif (perbaikan
    // bersifat retroaktif, lihat menu Revisi). Makanya baris ini TIDAK early
    // return null saat shiftStartedAt kosong — beda dari sebelum fitur ini.
    const startedAt = session.shiftStartedAt ? new Date(session.shiftStartedAt) : null;
    const startedAtValid =
      startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null;
    return {
      recipientUserId: session.sub,
      OR: [
        ...(startedAtValid
          ? [
              {
                type: "supervisi_update_kegiatan" as const,
                createdAt: { gte: startedAtValid },
              },
            ]
          : []),
        { type: "revisi_diminta" as const },
      ],
    };
  }
  if (session.role === "supervisi") {
    return {
      recipientUserId: session.sub,
      OR: [
        {
          type: "petugas_open_tiket",
          ticket: { is: { owner: { is: { currentSupervisiId: session.sub } } } },
        },
        { type: "revisi_disubmit" },
      ],
    };
  }
  return null;
}

export async function countUnreadNotifications(
  session: SessionPayload
): Promise<number> {
  const where = scopeWhere(session);
  if (!where) return 0;
  return prisma.notification.count({ where: { ...where, isRead: false } });
}

/**
 * Ambil notifikasi terbaru dalam scope sesi ini, lalu tandai SEMUA yang masih
 * cocok (bukan cuma yang ditampilkan) sebagai sudah dibaca — badge angka
 * langsung reset ke 0 begitu lonceng dibuka.
 */
export async function listAndMarkReadNotifications(
  session: SessionPayload
): Promise<NotificationListItem[]> {
  const where = scopeWhere(session);
  if (!where) return [];

  const items = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: LIST_TAKE,
    include: { ticket: { select: { noTiket: true } } },
  });

  await prisma.notification.updateMany({
    where: { ...where, isRead: false },
    data: { isRead: true },
  });

  return items.map((n) => ({
    id: n.id,
    ticketId: n.ticketId,
    noTiket: n.ticket.noTiket,
    message: n.message,
    createdAt: n.createdAt,
    isRead: n.isRead,
  }));
}
