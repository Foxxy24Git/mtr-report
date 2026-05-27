import { NextResponse } from "next/server";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ALL_SHIFTS, nextShift, type ShiftCode } from "@/lib/shift";

const TINDAK_LANJUT_TEKS = "TINDAK LANJUT MONITORING SELANJUTNYA";

/**
 * POST /api/shift/handover — serah terima shift batch (PRD §3, §4.B).
 *
 * Aksi global tanpa input nama/jam:
 * - shift tujuan ditentukan otomatis dari shift aktif sesi (mapping next-shift).
 * - SEMUA tiket open diteruskan sekaligus ke shift berikutnya.
 * - tiap tiket open mendapat penanda "TINDAK LANJUT MONITORING SELANJUTNYA".
 * - satu baris shift_handovers dicatat untuk seluruh batch.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role === "supervisi") {
    return NextResponse.json(
      { error: "Supervisi tidak dapat melakukan serah terima." },
      { status: 403 }
    );
  }

  const fromShift = session.shift;
  if (!ALL_SHIFTS.includes(fromShift as ShiftCode)) {
    return NextResponse.json(
      { error: "Pilih shift aktif di Dashboard sebelum serah terima." },
      { status: 400 }
    );
  }
  const toShift = nextShift(fromShift as ShiftCode);

  const openTickets = await prisma.ticket.findMany({
    where: { status: TicketStatus.proses },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.shiftHandover.create({
      data: {
        fromUserId: session.sub,
        fromShift: fromShift as ShiftKode,
        toShift,
      },
    });

    if (openTickets.length > 0) {
      // Penanda dicatat di shift yang ditutup, sebelum entri shift baru.
      await tx.ticketActivity.createMany({
        data: openTickets.map((t) => ({
          ticketId: t.id,
          userId: session.sub,
          shiftKode: fromShift as ShiftKode,
          teks: TINDAK_LANJUT_TEKS,
          isTindakLanjutFlag: true,
        })),
      });
      await tx.ticket.updateMany({
        where: { status: TicketStatus.proses },
        data: { shiftKode: toShift },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    fromShift,
    toShift,
    count: openTickets.length,
  });
}
