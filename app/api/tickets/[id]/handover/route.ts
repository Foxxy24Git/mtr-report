import { NextResponse } from "next/server";
import { Role, ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";

type Params = { params: Promise<{ id: string }> };

const SHIFTS = Object.values(ShiftKode) as string[];

const TINDAK_LANJUT_TEKS = "TINDAK LANJUT MONITORING SELANJUTNYA";

/**
 * POST /api/tickets/[id]/handover — serah terima shift (PRD §3, §4.B.c).
 * Menyisipkan penanda "TINDAK LANJUT MONITORING SELANJUTNYA", mencatat
 * shift_handovers, lalu memindahkan owner ke petugas shift berikutnya.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const ticket = guard.ticket;
  if (ticket.status === TicketStatus.selesai) {
    return NextResponse.json(
      { error: "Tiket sudah selesai — tidak perlu serah terima." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const toUserId = typeof body?.toUserId === "string" ? body.toUserId.trim() : "";
  const toShift = typeof body?.toShift === "string" ? body.toShift.trim() : "";

  if (!SHIFTS.includes(toShift)) {
    return NextResponse.json({ error: "Shift tujuan tidak valid." }, { status: 400 });
  }
  if (!toUserId) {
    return NextResponse.json(
      { error: "Pilih petugas shift berikutnya." },
      { status: 400 }
    );
  }
  if (toUserId === ticket.ownerUserId) {
    return NextResponse.json(
      { error: "Petugas tujuan tidak boleh sama dengan pemilik saat ini." },
      { status: 400 }
    );
  }
  const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!toUser || toUser.role === Role.supervisi) {
    return NextResponse.json(
      { error: "Petugas tujuan harus petugas monitoring yang valid." },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftHandover.create({
      data: {
        ticketId: ticket.id,
        fromUserId: ticket.ownerUserId,
        toUserId,
        fromShift: ticket.shiftKode,
        toShift: toShift as ShiftKode,
      },
    });

    // Penanda dicatat di shift yang ditutup, sebelum entri shift baru.
    await tx.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        userId: ticket.ownerUserId,
        shiftKode: ticket.shiftKode,
        teks: TINDAK_LANJUT_TEKS,
        isTindakLanjutFlag: true,
      },
    });

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { ownerUserId: toUserId, shiftKode: toShift as ShiftKode },
    });
  });

  return NextResponse.json({ ok: true });
}
