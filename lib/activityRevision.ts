import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export interface RevisiListItem {
  id: string;
  activityId: string;
  ticketId: string;
  noTiket: string;
  kodeAtm: string;
  namaAtm: string;
  teksSaatIni: string;
  status: "menunggu_petugas" | "menunggu_verifikasi";
  catatan: string | null;
  createdAt: Date;
}

/**
 * Kotak masuk menu "Revisi" petugas: permintaan revisi pada baris kegiatan
 * yang DIA TULIS SENDIRI (activity.userId) — selaras hak edit kegiatan yang
 * sudah ada — dan belum `selesai`. Dipakai server page & GET /api/revisi.
 */
export async function listOpenRevisionsForUser(
  userId: string
): Promise<RevisiListItem[]> {
  const rows = await prisma.activityRevisionRequest.findMany({
    where: {
      status: { in: ["menunggu_petugas", "menunggu_verifikasi"] },
      activity: { userId },
    },
    orderBy: { createdAt: "desc" },
    include: {
      ticket: {
        select: {
          noTiket: true,
          atm: { select: { kodeAtm: true, namaAtm: true } },
        },
      },
      activity: { select: { id: true, teks: true } },
      events: {
        where: { catatan: { not: null } },
        orderBy: { at: "desc" },
        take: 1,
      },
    },
  });

  return rows
    .map((r) => ({
      id: r.id,
      activityId: r.activityId,
      ticketId: r.ticketId,
      noTiket: r.ticket.noTiket,
      kodeAtm: r.ticket.atm?.kodeAtm ?? "—",
      namaAtm: r.ticket.atm?.namaAtm ?? "—",
      teksSaatIni: r.activity.teks,
      status: r.status as "menunggu_petugas" | "menunggu_verifikasi",
      catatan: r.events[0]?.catatan ?? null,
      createdAt: r.createdAt,
    }))
    // Yang masih perlu aksi petugas ditampilkan lebih dulu.
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "menunggu_petugas" ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}

/** Jumlah item aktif di kotak masuk — dipakai badge menu Sidebar. */
export async function countOpenRevisionsForUser(userId: string): Promise<number> {
  return prisma.activityRevisionRequest.count({
    where: {
      status: { in: ["menunggu_petugas", "menunggu_verifikasi"] },
      activity: { userId },
    },
  });
}

const TRUNCATE_MAX = 100;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function buildRevisiDimintaMessage(
  supervisiNama: string,
  catatan: string
): string {
  return `Supervisi ${supervisiNama} meminta Anda merevisi satu kegiatan: "${truncate(
    catatan,
    TRUNCATE_MAX
  )}"`;
}

export function buildRevisiDisubmitMessage(petugasNama: string): string {
  return `Petugas ${petugasNama} sudah memperbaiki kegiatan yang Anda minta revisi — mohon diverifikasi.`;
}

function telegramHeader(title: string): string {
  return `📝 <b>${title} — mtr-Report</b>\n\n`;
}

/**
 * Kirim notif lonceng + Telegram (real-time, tanpa gate jam kerja — beda
 * dengan pengingat approval yang berulang tiap jam) ke petugas penulis baris
 * kegiatan saat Supervisi meminta revisi.
 *
 * Dibungkus try/catch di pemanggil bila perlu; fungsi ini sendiri tidak
 * melempar untuk kegagalan Telegram (konsisten dengan sendTelegramMessage).
 */
export async function notifyRevisiDiminta(params: {
  requestId: string;
  activityId: string;
  ticketId: string;
  noTiket: string;
  recipientUserId: string;
  supervisiNama: string;
  catatan: string;
}): Promise<void> {
  const message = buildRevisiDimintaMessage(params.supervisiNama, params.catatan);

  await prisma.notification.create({
    data: {
      recipientUserId: params.recipientUserId,
      ticketId: params.ticketId,
      activityId: params.activityId,
      type: "revisi_diminta",
      message,
    },
  });

  const recipient = await prisma.user.findUnique({
    where: { id: params.recipientUserId },
    select: { telegramChatId: true },
  });
  if (recipient?.telegramChatId) {
    const text =
      telegramHeader("Diminta Revisi Kegiatan") +
      `Tiket: <b>${params.noTiket}</b>\n` +
      `Supervisi ${params.supervisiNama} meminta Anda merevisi kegiatan berikut:\n` +
      `"${truncate(params.catatan, 300)}"\n\n` +
      `Silakan buka menu <b>Revisi</b> di aplikasi untuk memperbaikinya.`;
    await sendTelegramMessage(recipient.telegramChatId, text);
  }
}

/** Notif kebalikannya: petugas selesai revisi, minta Supervisi verifikasi ulang. */
export async function notifyRevisiDisubmit(params: {
  activityId: string;
  ticketId: string;
  noTiket: string;
  recipientUserId: string;
  petugasNama: string;
}): Promise<void> {
  const message = buildRevisiDisubmitMessage(params.petugasNama);

  await prisma.notification.create({
    data: {
      recipientUserId: params.recipientUserId,
      ticketId: params.ticketId,
      activityId: params.activityId,
      type: "revisi_disubmit",
      message,
    },
  });

  const recipient = await prisma.user.findUnique({
    where: { id: params.recipientUserId },
    select: { telegramChatId: true },
  });
  if (recipient?.telegramChatId) {
    const text =
      telegramHeader("Revisi Sudah Diperbaiki") +
      `Tiket: <b>${params.noTiket}</b>\n` +
      `Petugas ${params.petugasNama} sudah memperbaiki kegiatan yang Anda tandai revisi.\n\n` +
      `Mohon dicek & diverifikasi di halaman approve laporan shift.`;
    await sendTelegramMessage(recipient.telegramChatId, text);
  }
}
