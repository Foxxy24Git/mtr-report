import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string; activityId: string }> };

/**
 * PATCH /api/tickets/[id]/activities/[activityId] — edit satu entri kegiatan.
 *
 * Entri kini editable (bukan lagi append-only murni): pembuat entri atau
 * superadmin boleh memperbaiki teks & waktu. Setiap edit menyimpan snapshot
 * nilai lama ke ticket_activity_revisions dan menandai editedAt/editedById
 * sehingga jejak audit tetap terjaga (PRD §4.B.3).
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role === "supervisi") {
    return NextResponse.json(
      { error: "Supervisi tidak dapat mengubah kegiatan." },
      { status: 403 }
    );
  }

  const { id, activityId } = await params;

  const activity = await prisma.ticketActivity.findUnique({
    where: { id: activityId },
  });
  if (!activity || activity.ticketId !== id) {
    return NextResponse.json({ error: "Entri kegiatan tidak ditemukan." }, { status: 404 });
  }
  if (activity.isTindakLanjutFlag) {
    return NextResponse.json(
      { error: "Penanda serah terima shift tidak dapat diedit." },
      { status: 409 }
    );
  }

  // Hak edit: hanya pembuat entri atau superadmin (PRD §4.B.3 poin 5).
  const isPembuat = activity.userId === session.sub;
  if (session.role !== "superadmin" && !isPembuat) {
    return NextResponse.json(
      { error: "Hanya pembuat entri atau Super Admin yang dapat mengedit kegiatan ini." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);

  const teks = typeof body?.teks === "string" ? body.teks.trim() : "";
  if (!teks) {
    return NextResponse.json({ error: "Teks kegiatan wajib diisi." }, { status: 400 });
  }

  const waktu = new Date(body?.waktu);
  if (Number.isNaN(waktu.getTime())) {
    return NextResponse.json({ error: "Waktu entri tidak valid." }, { status: 400 });
  }

  const noChange = teks === activity.teks && waktu.getTime() === activity.waktu.getTime();
  if (noChange) {
    return NextResponse.json({ item: { id: activity.id } });
  }

  await prisma.$transaction([
    prisma.ticketActivityRevision.create({
      data: {
        activityId: activity.id,
        teks: activity.teks,
        waktu: activity.waktu,
        editedById: session.sub,
      },
    }),
    prisma.ticketActivity.update({
      where: { id: activity.id },
      data: { teks, waktu, editedAt: new Date(), editedById: session.sub },
    }),
  ]);

  return NextResponse.json({ item: { id: activity.id } });
}
