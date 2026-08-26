import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { notifyRevisiDiminta } from "@/lib/activityRevision";

type Params = { params: Promise<{ requestId: string }> };

/**
 * POST /api/revisi/[requestId]/verify — Supervisi memverifikasi hasil
 * perbaikan petugas. Body `{ action: "terima" | "tolak", catatan?: string }`.
 *
 * "terima" → request selesai, laporan shift terkait boleh di-approve.
 * "tolak"  → kembali ke status menunggu_petugas dengan alasan baru (bisa
 * berulang beberapa putaran — lihat ActivityRevisionEvent untuk jejaknya).
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "supervisi") {
    return NextResponse.json(
      { error: "Hanya Supervisi yang dapat memverifikasi revisi." },
      { status: 403 }
    );
  }

  const { requestId } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "terima" && action !== "tolak") {
    return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });
  }
  const catatan = typeof body?.catatan === "string" ? body.catatan.trim() : "";
  if (action === "tolak" && !catatan) {
    return NextResponse.json(
      { error: "Alasan wajib diisi saat menolak revisi." },
      { status: 400 }
    );
  }

  const request = await prisma.activityRevisionRequest.findUnique({
    where: { id: requestId },
    include: {
      ticket: { select: { id: true, noTiket: true, supervisiId: true } },
      activity: { select: { id: true, userId: true } },
    },
  });
  if (!request) {
    return NextResponse.json(
      { error: "Permintaan revisi tidak ditemukan." },
      { status: 404 }
    );
  }
  if (request.ticket.supervisiId !== session.sub) {
    return NextResponse.json(
      { error: "Tiket ini bukan tanggung jawab supervisi Anda." },
      { status: 403 }
    );
  }
  if (request.status !== "menunggu_verifikasi") {
    return NextResponse.json(
      { error: "Permintaan ini belum diperbaiki petugas atau sudah selesai." },
      { status: 409 }
    );
  }

  if (action === "terima") {
    await prisma.$transaction([
      prisma.activityRevisionRequest.update({
        where: { id: requestId },
        data: { status: "selesai", resolvedById: session.sub, resolvedAt: new Date() },
      }),
      prisma.activityRevisionEvent.create({
        data: {
          requestId,
          type: "diterima",
          byUserId: session.sub,
          catatan: catatan || null,
        },
      }),
    ]);
    return NextResponse.json({ item: { id: requestId, status: "selesai" } });
  }

  // action === "tolak"
  await prisma.$transaction([
    prisma.activityRevisionRequest.update({
      where: { id: requestId },
      data: { status: "menunggu_petugas" },
    }),
    prisma.activityRevisionEvent.create({
      data: { requestId, type: "ditolak_lagi", byUserId: session.sub, catatan },
    }),
  ]);

  try {
    await notifyRevisiDiminta({
      requestId,
      activityId: request.activity.id,
      ticketId: request.ticket.id,
      noTiket: request.ticket.noTiket,
      recipientUserId: request.activity.userId,
      supervisiNama: session.nama,
      catatan,
    });
  } catch (err) {
    console.error("[revisi] Gagal kirim notif ditolak lagi:", err);
  }

  return NextResponse.json({ item: { id: requestId, status: "menunggu_petugas" } });
}
