import { NextResponse } from "next/server";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";

type Params = { params: Promise<{ id: string }> };

const SHIFTS = Object.values(ShiftKode) as string[];

/**
 * POST /api/tickets/[id]/activities — tambah entri kegiatan (PRD §4.B.3).
 * Append-only: timestamp & user/shift dicatat otomatis, tidak bisa diedit/dihapus.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (!SHIFTS.includes(session.shift)) {
    return NextResponse.json(
      { error: "Shift sesi tidak valid. Silakan login ulang." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (guard.ticket.status === TicketStatus.selesai) {
    return NextResponse.json(
      { error: "Tiket sudah selesai — kegiatan tidak dapat ditambah." },
      { status: 409 }
    );
  }
  // Setelah serah terima, ticket.shiftKode berpindah ke shift berikutnya.
  // Hanya petugas shift aktif (atau Super Admin) yang boleh menambah kegiatan.
  if (session.role !== "superadmin" && guard.ticket.shiftKode !== session.shift) {
    return NextResponse.json(
      {
        error:
          "Tiket ini sudah diserahkan ke shift berikutnya. Kegiatan hanya bisa ditambahkan oleh petugas shift aktif.",
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const teks = typeof body?.teks === "string" ? body.teks.trim() : "";
  if (!teks) {
    return NextResponse.json({ error: "Teks kegiatan wajib diisi." }, { status: 400 });
  }

  const activity = await prisma.ticketActivity.create({
    data: {
      ticketId: id,
      userId: session.sub,
      shiftKode: session.shift as ShiftKode,
      teks,
    },
    include: { user: { select: { nama: true } } },
  });

  return NextResponse.json({ item: activity }, { status: 201 });
}
