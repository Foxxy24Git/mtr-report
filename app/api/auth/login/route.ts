import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE, isSecureCookie } from "@/lib/jwt";
import type { Role } from "@/lib/roles";
import { resumableShiftSession } from "@/lib/shift";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = (body?.username ?? "").trim();
  const password = body?.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username dan password wajib diisi." },
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
  // Akun dinonaktifkan (soft delete oleh Super Admin) tidak boleh login.
  if (!user.isAktif) {
    return NextResponse.json(
      { error: "Akun dinonaktifkan. Hubungi Super Admin." },
      { status: 403 }
    );
  }

  // Sesi shift bertahan melewati logout: logout menutup sesi login, bukan sesi
  // shift. Selama shift belum diserahterimakan / ditutup (yang mengosongkan
  // kolom ini di DB), petugas tetap dapat memantau & mengedit tiketnya di
  // Daily Monitoring setelah login kembali.
  const resumed = resumableShiftSession(user.currentShift, user.shiftStartedAt);

  // Catat waktu login terakhir (kolom Member Dashboard Super Admin). Sekaligus
  // bersihkan sesi shift yang sudah kedaluwarsa (>12 jam — petugas lupa menutup
  // shift) agar kolom "Shift Aktif" di dashboard Super Admin tidak menyesatkan.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLogin: new Date(),
      ...(resumed.shift ? {} : { currentShift: null, shiftStartedAt: null }),
    },
  });

  const token = await signSession({
    sub: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role as Role,
    shift: resumed.shift,
    shiftStartedAt: resumed.shiftStartedAt,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({
    ok: true,
    user: {
      username: user.username,
      nama: user.nama,
      role: user.role,
    },
  });
}
