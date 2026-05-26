import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/close — tutup tiket (PRD §4.B.4).
 * Status → selesai, Waktu Selesai Gangguan dicatat otomatis (now).
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (guard.ticket.status === TicketStatus.selesai) {
    return NextResponse.json({ error: "Tiket sudah selesai." }, { status: 409 });
  }

  await prisma.ticket.update({
    where: { id },
    data: { status: TicketStatus.selesai, waktuSelesai: new Date() },
  });

  return NextResponse.json({ ok: true });
}
