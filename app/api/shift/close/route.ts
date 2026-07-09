import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE, isSecureCookie } from "@/lib/jwt";
import { ALL_SHIFTS, type ShiftCode } from "@/lib/shift";
import { getShiftLabel } from "@/lib/shiftReport";
import { notifyReportPending } from "@/lib/telegramScheduler";

const TINDAK_LANJUT_TEKS = "TINDAK LANJUT MONITORING SELANJUTNYA";

/**
 * POST /api/shift/close — "Tutup Laporan Shift" (PART 6).
 *
 * Dipakai saat user lupa serah terima: membuat ShiftReport TANPA penerima.
 * Berbeda dari serah terima, route ini TIDAK merotasi shiftKode tiket open ke
 * shift berikutnya (tidak ada penerima yang melanjutkan). Tiket shift ini tetap
 * diikat ke supervisi pilihan agar dapat di-approve. Sesi shift dikosongkan.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role === "supervisi") {
    return NextResponse.json(
      { error: "Supervisi tidak menutup laporan shift." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }
  const pimpinanInfraId =
    typeof body.pimpinanInfraId === "string" ? body.pimpinanInfraId : "";
  const pimpinanDivisiId =
    typeof body.pimpinanDivisiId === "string" ? body.pimpinanDivisiId : "";
  const supervisiId =
    typeof body.supervisiId === "string" ? body.supervisiId : "";
  const supervisiNextId =
    typeof body.supervisiNextId === "string" && body.supervisiNextId
      ? body.supervisiNextId
      : null;
  if (!pimpinanInfraId || !pimpinanDivisiId || !supervisiId) {
    return NextResponse.json(
      {
        error:
          "Pilih Pimpinan Bag. Infrastruktur, Pimpinan Divisi, dan Supervisi terlebih dahulu.",
      },
      { status: 400 }
    );
  }

  const fromShift = session.shift;
  if (!ALL_SHIFTS.includes(fromShift as ShiftCode)) {
    return NextResponse.json(
      { error: "Tidak ada shift aktif untuk ditutup." },
      { status: 400 }
    );
  }

  // Lingkup tiket "shift ini" — sama dengan serah terima (PRD revisi §4.B).
  const startedAt = session.shiftStartedAt
    ? new Date(session.shiftStartedAt)
    : null;
  const mineWhere: Record<string, unknown> = { ownerUserId: session.sub };
  if (startedAt && !Number.isNaN(startedAt.getTime())) {
    mineWhere.waktuOpen = { gte: startedAt };
  }
  const shiftScopeOR = [
    mineWhere,
    { activities: { some: { isTindakLanjutFlag: true } } },
  ];

  const openTickets = await prisma.ticket.findMany({
    where: { status: TicketStatus.proses },
    select: { id: true },
  });

  const report = await prisma.$transaction(async (tx) => {
    const handover = await tx.shiftHandover.create({
      data: {
        fromUserId: session.sub,
        toUserId: null,
        fromShift: fromShift as ShiftKode,
        toShift: fromShift as ShiftKode,
        pimpinanInfraId,
        pimpinanDivisiId,
        supervisiId,
        supervisiNextId,
      },
    });

    // Ikat seluruh tiket shift ini (proses & selesai) ke supervisi pilihan.
    await tx.ticket.updateMany({
      where: { shiftKode: fromShift as ShiftKode, OR: shiftScopeOR },
      data: { supervisiId },
    });

    if (openTickets.length > 0) {
      await tx.ticketActivity.createMany({
        data: openTickets.map((t) => ({
          ticketId: t.id,
          userId: session.sub,
          shiftKode: fromShift as ShiftKode,
          teks: TINDAK_LANJUT_TEKS,
          isTindakLanjutFlag: true,
        })),
      });
    }

    return tx.shiftReport.create({
      data: {
        tanggal: new Date(),
        shiftKode: fromShift as ShiftKode,
        shiftLabel: getShiftLabel(fromShift),
        ownerUserId: session.sub,
        receiverUserId: null,
        supervisiId,
        supervisiNextId,
        pimpinanInfraId,
        pimpinanDivisiId,
        handoverId: handover.id,
      },
    });
  });

  // Fase 4: notif langsung ke supervisi terpilih (di-gate jadwal WIB; di luar
  // jadwal scheduler yang akan mengirim). Tidak boleh menggagalkan tutup laporan.
  await notifyReportPending(report.id);

  // Akhiri sesi shift (kosongkan) seperti pada serah terima.
  const token = await signSession({
    sub: session.sub,
    username: session.username,
    nama: session.nama,
    role: session.role,
    shift: "",
    shiftStartedAt: "",
  });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, shift: fromShift, count: openTickets.length });
}
