import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/jwt";
import { ALL_SHIFTS, nextShift, type ShiftCode } from "@/lib/shift";

const TINDAK_LANJUT_TEKS = "TINDAK LANJUT MONITORING SELANJUTNYA";

/**
 * POST /api/shift/handover — serah terima shift batch (PRD §3, §4.B).
 *
 * Aksi global tanpa input nama/jam:
 * - shift tujuan ditentukan otomatis dari shift aktif sesi (mapping next-shift).
 * - SEMUA tiket open diteruskan sekaligus ke shift berikutnya.
 * - tiap tiket open mendapat penanda "TINDAK LANJUT MONITORING SELANJUTNYA".
 * - satu baris shift_handovers dicatat untuk seluruh batch.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role === "supervisi") {
    return NextResponse.json(
      { error: "Supervisi tidak dapat melakukan serah terima." },
      { status: 403 }
    );
  }

  // Penanda tangan laporan dipilih pada modal serah terima (PRD revisi §2).
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
      { error: "Pilih shift aktif di Dashboard sebelum serah terima." },
      { status: 400 }
    );
  }
  const toShift = nextShift(fromShift as ShiftCode);

  const openTickets = await prisma.ticket.findMany({
    where: { status: TicketStatus.proses },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.shiftHandover.create({
      data: {
        fromUserId: session.sub,
        fromShift: fromShift as ShiftKode,
        toShift,
        pimpinanInfraId,
        pimpinanDivisiId,
        supervisiId,
        supervisiNextId,
      },
    });

    if (openTickets.length > 0) {
      // Penanda dicatat di shift yang ditutup, sebelum entri shift baru.
      await tx.ticketActivity.createMany({
        data: openTickets.map((t) => ({
          ticketId: t.id,
          userId: session.sub,
          shiftKode: fromShift as ShiftKode,
          teks: TINDAK_LANJUT_TEKS,
          isTindakLanjutFlag: true,
        })),
      });
      // Setiap tiket di-handover diikat ke supervisi pilihan modal (PRD revisi
      // §2/§3): supervisi tsb yang berhak meng-approve tiket ini nantinya.
      await tx.ticket.updateMany({
        where: { status: TicketStatus.proses },
        data: { shiftKode: toShift, supervisiId },
      });
    }
  });

  // Shift session berakhir: kosongkan shift sesi user agar Daily Monitoring
  // kembali kosong & siap untuk shift berikutnya (PRD revisi §4.B).
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({
    ok: true,
    fromShift,
    toShift,
    count: openTickets.length,
  });
}
