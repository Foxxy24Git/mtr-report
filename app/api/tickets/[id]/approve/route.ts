import { NextResponse } from "next/server";
import { StatusSupervisi, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/approve — Supervisi menyetujui tiket yang sudah close
 * (PRD §4.G, §11.6). Setelah approve: status_supervisi=approved & tanda tangan
 * digital supervisi otomatis terpasang di laporan (via ttdUrl approver).
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "supervisi") {
    return NextResponse.json(
      { error: "Hanya Supervisi yang dapat menyetujui tiket." },
      { status: 403 }
    );
  }
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
  }
  if (ticket.status !== TicketStatus.selesai) {
    return NextResponse.json(
      { error: "Hanya tiket yang sudah Selesai (close) yang dapat disetujui." },
      { status: 409 }
    );
  }
  if (ticket.statusSupervisi === StatusSupervisi.approved) {
    return NextResponse.json({ error: "Tiket sudah disetujui." }, { status: 409 });
  }

  await prisma.ticket.update({
    where: { id },
    data: {
      statusSupervisi: StatusSupervisi.approved,
      approvedById: session.sub,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
