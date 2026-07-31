import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/close — tutup tiket (PRD §4.B.4).
 * Status → selesai, Waktu Selesai Gangguan dicatat otomatis (now).
 * Body opsional { waktuSelesai } untuk mengoreksi ke waktu selesai sebenarnya
 * (mis. gangguan beres jam 16:00 tapi tiket baru sempat ditutup jam 19:00).
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
  if (guard.ticket.status === TicketStatus.selesai) {
    return NextResponse.json({ error: "Tiket sudah selesai." }, { status: 409 });
  }

  // --- Waktu selesai (opsional) ---
  // Kosong/tidak dikirim → pakai waktu saat ini (perilaku default).
  const body = await req.json().catch(() => null);
  let waktuSelesai = new Date();
  if (typeof body?.waktuSelesai === "string" && body.waktuSelesai.trim()) {
    waktuSelesai = new Date(body.waktuSelesai);
    if (Number.isNaN(waktuSelesai.getTime())) {
      return NextResponse.json(
        { error: "Waktu selesai tidak valid." },
        { status: 400 }
      );
    }
  }
  // Cegah durasi SLA negatif (lib/sla.ts menghitung waktuOpen → waktuSelesai).
  if (waktuSelesai.getTime() < guard.ticket.waktuOpen.getTime()) {
    return NextResponse.json(
      { error: "Waktu selesai tidak boleh sebelum waktu open tiket." },
      { status: 400 }
    );
  }

  await prisma.ticket.update({
    where: { id },
    data: { status: TicketStatus.selesai, waktuSelesai },
  });

  return NextResponse.json({ ok: true });
}
