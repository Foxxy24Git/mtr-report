import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { basisSaatIni } from "@/lib/slaMonitoring";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/sla-eksternal/start — lanjutkan lagi hitungan SLA
 * Eksternal setelah sebelumnya di-stop (mis. PIC vendor sudah bisa
 * dihubungi lagi). Tanpa body — No Tiket Vendor yang sama tetap dipakai,
 * tidak perlu diisi ulang. Hanya berlaku untuk tiket status "Proses" yang
 * sudah pernah lapor vendor DAN sedang dalam status Internal (habis stop).
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
  if (basisSaatIni(latest) !== "internal") {
    return NextResponse.json(
      { error: "SLA sudah dalam status Eksternal." },
      { status: 409 }
    );
  }

  await prisma.ticketSlaEpisode.create({
    data: {
      ticketId: id,
      basis: "eksternal",
      dibuatOlehId: session.sub,
    },
  });

  return NextResponse.json({ ok: true });
}
