import "server-only";
import type { Ticket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/jwt";

export type GuardResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; status: number; error: string };

/**
 * Izin mutasi tiket (update kegiatan, edit, close, hapus).
 * Supervisi hanya boleh melihat — tidak boleh mengubah (PRD §2).
 * Selain superadmin, boleh bila pemilik tiket ATAU petugas pada shift aktif
 * yang kini memegang tiket (mendukung serah terima shift batch otomatis).
 */
export async function guardTicketMutation(
  session: SessionPayload,
  ticketId: string
): Promise<GuardResult> {
  if (session.role === "supervisi") {
    return { ok: false, status: 403, error: "Supervisi tidak dapat mengubah tiket." };
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return { ok: false, status: 404, error: "Tiket tidak ditemukan." };
  }
  const isOwner = ticket.ownerUserId === session.sub;
  const isShiftHolder = !!session.shift && ticket.shiftKode === session.shift;
  if (session.role !== "superadmin" && !isOwner && !isShiftHolder) {
    return {
      ok: false,
      status: 403,
      error:
        "Hanya pemilik tiket, petugas shift yang memegang tiket, atau Super Admin yang dapat mengubah tiket ini.",
    };
  }
  return { ok: true, ticket };
}
