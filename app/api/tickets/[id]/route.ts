import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { getTicketDetail } from "@/lib/ticketQueries";

type Params = { params: Promise<{ id: string }> };

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: unknown): string | null {
  const s = cleanStr(v);
  return s.length ? s : null;
}

/** GET /api/tickets/[id] — detail tiket + kronologi kegiatan + handover. */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;

  const ticket = await getTicketDetail(id);
  if (!ticket) {
    return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ item: ticket });
}

/** PATCH /api/tickets/[id] — ubah field gangguan & pimpinan (PRD §4.B). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);

  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      jenisGangguan: optStr(body?.jenisGangguan),
      sumberPenyebab: optStr(body?.sumberPenyebab),
      metodePenanganan: optStr(body?.metodePenanganan),
      vendor: optStr(body?.vendor),
      noTiketVendor: optStr(body?.noTiketVendor),
      keterangan: optStr(body?.keterangan),
    },
  });

  return NextResponse.json({ item: { id: updated.id } });
}

/** DELETE /api/tickets/[id] — hapus tiket (gangguan sesaat). Owner/superadmin. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    // activities & handovers ikut terhapus (onDelete: Cascade di schema).
    await prisma.ticket.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
    }
    throw e;
  }
}
