import { NextResponse } from "next/server";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { buildSupervisiActivityMessage } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const SHIFTS = Object.values(ShiftKode) as string[];

/**
 * POST /api/tickets/[id]/activities — tambah entri kegiatan (PRD §4.B.3).
 * Append-only: timestamp & user/shift dicatat otomatis, tidak bisa
 * diedit/dihapus lewat endpoint ini (edit ada di PATCH terpisah, dan PATCH
 * itu sendiri memblokir role supervisi — jangan disentuh).
 *
 * Dua jalur:
 * - Supervisi: catatan pengawasan pada tiket yang jadi tanggung jawabnya
 *   (ticket.supervisiId). Boleh kapan saja (Proses maupun Selesai) —
 *   ticket.supervisiId kini sudah terisi sejak tiket dibuka (lihat
 *   app/api/tickets/route.ts), bukan cuma sejak handover/close. Disimpan
 *   dengan isSupervisiEntry=true — otomatis tidak ikut ke laporan/download
 *   mana pun, tetap tampil di layar.
 * - Petugas / Super Admin: alur mutasi tiket biasa, tidak berubah selain
 *   penambahan filter isSupervisiEntry di hitungan waktu respon internal.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const teks = typeof body?.teks === "string" ? body.teks.trim() : "";
  if (!teks) {
    return NextResponse.json({ error: "Teks kegiatan wajib diisi." }, { status: 400 });
  }

  // --- Jalur Supervisi: catatan pengawasan, di luar guardTicketMutation ---
  if (session.role === "supervisi") {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
    }
    // Pola sama seperti app/api/tickets/[id]/approve/route.ts — Supervisi
    // hanya boleh bertindak pada tiket yang terikat ke dirinya.
    if (ticket.supervisiId !== session.sub) {
      return NextResponse.json(
        { error: "Tiket ini bukan tanggung jawab supervisi Anda." },
        { status: 403 }
      );
    }
    const activity = await prisma.ticketActivity.create({
      data: {
        ticketId: id,
        userId: session.sub,
        shiftKode: ticket.shiftKode,
        teks,
        isSupervisiEntry: true,
      },
      include: { user: { select: { nama: true } } },
    });
    // Notif lonceng Topbar: beri tahu petugas pemilik tiket bahwa Supervisi
    // baru saja menambah kegiatan pengawasan (lib/notifications.ts).
    await prisma.notification.create({
      data: {
        recipientUserId: ticket.ownerUserId,
        ticketId: ticket.id,
        activityId: activity.id,
        type: "supervisi_update_kegiatan",
        message: buildSupervisiActivityMessage(session.nama, teks),
      },
    });
    return NextResponse.json({ item: activity }, { status: 201 });
  }

  // --- Jalur Petugas / Super Admin (alur lama) ---
  if (!SHIFTS.includes(session.shift)) {
    return NextResponse.json(
      { error: "Shift sesi tidak aktif. Pilih shift di Dashboard terlebih dahulu." },
      { status: 400 }
    );
  }
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

  // Hitung kegiatan yang sudah ada SEBELUM entri baru ini ditambahkan.
  // existingCount === 1 berarti entri baru ini adalah kegiatan KEDUA
  // (update pertama setelah open) → timestamp-nya menjadi waktu respon
  // internal. isSupervisiEntry: false WAJIB ada di sini — catatan
  // pengawasan Supervisi bukan bagian log resmi petugas, tidak boleh ikut
  // menggeser hitungan SLA ini.
  const existingCount = await prisma.ticketActivity.count({
    where: { ticketId: id, isSupervisiEntry: false },
  });

  const activity = await prisma.ticketActivity.create({
    data: {
      ticketId: id,
      userId: session.sub,
      shiftKode: session.shift as ShiftKode,
      teks,
    },
    include: { user: { select: { nama: true } } },
  });

  // Kunci waktu respon internal pada kegiatan ke-2 saja (sekali isi, immutable).
  if (existingCount === 1 && !guard.ticket.waktuResponInternal) {
    await prisma.ticket.update({
      where: { id },
      data: { waktuResponInternal: activity.waktu },
    });
  }

  return NextResponse.json({ item: activity }, { status: 201 });
}
