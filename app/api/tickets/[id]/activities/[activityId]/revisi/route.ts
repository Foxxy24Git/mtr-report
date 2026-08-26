import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { notifyRevisiDiminta } from "@/lib/activityRevision";

type Params = { params: Promise<{ id: string; activityId: string }> };

/**
 * POST /api/tickets/[id]/activities/[activityId]/revisi — Supervisi menandai
 * satu baris kegiatan sebagai butuh revisi (typo/salah catat petugas).
 *
 * Hanya Supervisi penanggung jawab tiket ini (ticket.supervisiId) yang boleh
 * menandai — sama seperti hak menambah catatan pengawasan (POST .../activities).
 * Selama request ini belum `selesai`, tombol approve laporan shift terkait
 * ikut terkunci (lihat app/api/shift-reports/[id]/approve/route.ts).
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "supervisi") {
    return NextResponse.json(
      { error: "Hanya Supervisi yang dapat meminta revisi kegiatan." },
      { status: 403 }
    );
  }

  const { id, activityId } = await params;

  const body = await req.json().catch(() => null);
  const catatan = typeof body?.catatan === "string" ? body.catatan.trim() : "";
  if (!catatan) {
    return NextResponse.json(
      { error: "Alasan revisi wajib diisi." },
      { status: 400 }
    );
  }

  const activity = await prisma.ticketActivity.findUnique({
    where: { id: activityId },
    include: {
      ticket: { select: { id: true, noTiket: true, supervisiId: true } },
      revisionRequests: {
        where: { status: { not: "selesai" } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!activity || activity.ticketId !== id) {
    return NextResponse.json({ error: "Entri kegiatan tidak ditemukan." }, { status: 404 });
  }
  if (activity.ticket.supervisiId !== session.sub) {
    return NextResponse.json(
      { error: "Tiket ini bukan tanggung jawab supervisi Anda." },
      { status: 403 }
    );
  }
  if (activity.isTindakLanjutFlag) {
    return NextResponse.json(
      { error: "Penanda serah terima shift tidak dapat ditandai revisi." },
      { status: 409 }
    );
  }
  if (activity.revisionRequests.length > 0) {
    return NextResponse.json(
      { error: "Baris ini sudah punya permintaan revisi yang belum selesai." },
      { status: 409 }
    );
  }

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.activityRevisionRequest.create({
      data: {
        activityId: activity.id,
        ticketId: activity.ticketId,
        createdById: session.sub,
      },
    });
    await tx.activityRevisionEvent.create({
      data: {
        requestId: created.id,
        type: "diminta",
        byUserId: session.sub,
        catatan,
      },
    });
    return created;
  });

  try {
    await notifyRevisiDiminta({
      requestId: request.id,
      activityId: activity.id,
      ticketId: activity.ticketId,
      noTiket: activity.ticket.noTiket,
      recipientUserId: activity.userId,
      supervisiNama: session.nama,
      catatan,
    });
  } catch (err) {
    console.error("[revisi] Gagal kirim notif diminta:", err);
  }

  return NextResponse.json({ item: { id: request.id } }, { status: 201 });
}
