import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/reopen — buka kembali tiket yang sudah ditutup.
 *
 * Override Super Admin untuk mengoreksi human error (petugas salah close
 * tiket) tanpa koordinasi manual di luar sistem.
 *
 * Guard SENGAJA tidak memakai guardTicketMutation: helper itu juga meloloskan
 * pemilik tiket & petugas shift pemegang, sedangkan reopen harus benar-benar
 * superadmin-only.
 *
 * Efeknya minimal & sengaja terbatas: status kembali `proses` dan
 * `waktuSelesai` dikosongkan. Tidak ada field lain yang disentuh (klasifikasi
 * gangguan, vendor, shiftKode, openShiftKode, ownerUserId, statusSupervisi,
 * dsb.) sesuai kebutuhan "reopen tanpa merubah apa pun".
 *
 * Jejak audit dicatat ke tabel audit_logs (action "reopen").
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json(
      { error: "Hanya Super Admin yang dapat membuka kembali tiket." },
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
      { error: "Tiket masih berstatus proses — tidak perlu dibuka kembali." },
      { status: 409 }
    );
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: { status: TicketStatus.proses, waktuSelesai: null },
  });

  await writeAuditLog({
    userId: session.sub,
    username: session.username,
    action: "reopen",
    tableName: "tickets",
    rowId: id,
    before: {
      noTiket: ticket.noTiket,
      status: ticket.status,
      waktuSelesai: ticket.waktuSelesai,
    },
    after: {
      noTiket: updated.noTiket,
      status: updated.status,
      waktuSelesai: updated.waktuSelesai,
    },
  });

  return NextResponse.json({ ok: true });
}
