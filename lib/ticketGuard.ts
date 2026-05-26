import "server-only";
import type { Ticket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/jwt";

export type GuardResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; status: number; error: string };

/**
 * Izin mutasi tiket (update kegiatan, edit, handover, close, hapus).
 * Supervisi hanya boleh melihat — tidak boleh mengubah (PRD §2).
 * Selain superadmin, hanya pemilik tiket shift saat ini yang boleh.
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
  if (session.role !== "superadmin" && ticket.ownerUserId !== session.sub) {
    return {
      ok: false,
      status: 403,
      error: "Hanya pemilik tiket (shift saat ini) atau Super Admin yang dapat mengubah tiket ini.",
    };
  }
  return { ok: true, ticket };
}
