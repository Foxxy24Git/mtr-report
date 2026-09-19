import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { basisSaatIni } from "@/lib/slaMonitoring";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/sla-eksternal/stop — hentikan sementara hitungan
 * SLA Eksternal, kembali ke Internal (mis. PIC vendor tidak bisa
 * dihubungi/eksekusi). Body opsional `{ catatan }` — alasan, tidak wajib.
 * Hanya berlaku untuk tiket status "Proses" yang sudah pernah lapor vendor.
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
  if (guard.ticket.status !== TicketStatus.proses) {
    return NextResponse.json(
      { error: "Hanya tiket berstatus Proses yang bisa diubah." },
      { status: 409 }
    );
  }
  if (!guard.ticket.waktuLaporVendor) {
    return NextResponse.json(
      { error: "Tiket ini belum pernah lapor ke vendor." },
      { status: 409 }
    );
  }

  const latest = await prisma.ticketSlaEpisode.findFirst({
    where: { ticketId: id },
    orderBy: { mulai: "desc" },
  });
  if (basisSaatIni(latest) !== "eksternal") {
    return NextResponse.json(
      { error: "SLA sudah dalam status Internal." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const catatan =
    typeof body?.catatan === "string" && body.catatan.trim()
      ? body.catatan.trim()
      : null;

  await prisma.ticketSlaEpisode.create({
    data: {
      ticketId: id,
      basis: "internal",
      catatan,
      dibuatOlehId: session.sub,
    },
  });

  return NextResponse.json({ ok: true });
}
