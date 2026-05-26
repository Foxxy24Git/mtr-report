import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/jwt";
import { isShiftValidForDate, ALL_SHIFTS, type ShiftCode } from "@/lib/shift";
import { SHIFT_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/roles";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = (body?.username ?? "").trim();
  const password = body?.password ?? "";
  const shift = (body?.shift ?? "").trim();

  if (!username || !password || !shift) {
    return NextResponse.json(
      { error: "Username, password, dan shift wajib diisi." },
      { status: 400 }
    );
  }

  if (!ALL_SHIFTS.includes(shift as ShiftCode)) {
    return NextResponse.json({ error: "Shift tidak dikenal." }, { status: 400 });
  }

  if (!isShiftValidForDate(shift, new Date())) {
    return NextResponse.json(
      {
        error: `${SHIFT_LABELS[shift] ?? "Shift " + shift} tidak berlaku untuk hari ini.`,
      },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Username atau password salah." },
      { status: 401 }
    );
  }

  const token = await signSession({
    sub: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role as Role,
    shift,
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
    user: {
      username: user.username,
      nama: user.nama,
      role: user.role,
      shift,
    },
  });
}
