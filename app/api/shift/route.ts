import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE, isSecureCookie } from "@/lib/jwt";
import { ALL_SHIFTS, shiftSessionStart, type ShiftCode } from "@/lib/shift";

/** POST /api/shift — set shift aktif sesi (dipilih dari Dashboard). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const shift = (body?.shift ?? "").trim();

  if (!ALL_SHIFTS.includes(shift as ShiftCode)) {
    return NextResponse.json({ error: "Shift tidak dikenal." }, { status: 400 });
  }

  // Memilih shift yang sama dengan sesi yang sedang berjalan TIDAK memulai sesi
  // baru: awal sesi dipertahankan agar batas tiket Daily Monitoring tidak
  // bergeser (lihat shiftSessionStart di lib/shift.ts).
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { currentShift: true, shiftStartedAt: true },
  });
  const { startedAt } = shiftSessionStart(
    shift as ShiftCode,
    user?.currentShift,
    user?.shiftStartedAt
  );

  // Persist shift aktif & awalnya ke DB (kolom Shift Aktif Dashboard Super Admin).
  await prisma.user.update({
    where: { id: session.sub },
    data: { currentShift: shift as ShiftKode, shiftStartedAt: startedAt },
  });

  const token = await signSession({
    sub: session.sub,
    username: session.username,
    nama: session.nama,
    role: session.role,
    shift,
    // Awal shift session — penanda batas tiket Daily Monitoring (PRD revisi
    // §4.B). Sengaja memakai nilai yang sama dengan yang ditulis ke DB agar
    // cookie & DB tidak pernah menyimpan waktu mulai yang berbeda.
    shiftStartedAt: startedAt.toISOString(),
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, shift });
}
