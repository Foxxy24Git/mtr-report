import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE, isSecureCookie } from "@/lib/jwt";
import type { Role } from "@/lib/roles";
import { resumableShiftSession, SHIFT_RESUME_MAX_AGE_MS } from "@/lib/shift";

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

  // Kolom sesi shift hanya boleh dihapus bila memang kedaluwarsa karena umur
  // (>SHIFT_RESUME_MAX_AGE_MS — petugas lupa menutup shift). JANGAN pakai
  // "!resumed.shift" sebagai syarat: resumableShiftSession juga menolak saat
  // usia < 0 (jam server bergeser mundur, mis. koreksi NTP / restart
  // kontainer) padahal sesinya masih hidup — menghapus di jalur itu akan
  // membuang shiftStartedAt asli secara permanen dan memaksa petugas memilih
  // shift lagi, mengorbankan tiketnya sendiri.
  const kedaluwarsa =
    user.shiftStartedAt != null &&
    Date.now() - user.shiftStartedAt.getTime() > SHIFT_RESUME_MAX_AGE_MS;

  // Catat waktu login terakhir (kolom Member Dashboard Super Admin). Sekaligus
  // bersihkan sesi shift yang kedaluwarsa agar kolom "Shift Aktif" di dashboard
  // Super Admin tidak menyesatkan. Penghapusan ini murni kosmetik — JWT sudah
  // mengabaikan nilai basi lewat resumableShiftSession terlepas dari ada
  // tidaknya penghapusan di sini.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLogin: new Date(),
      ...(kedaluwarsa ? { currentShift: null, shiftStartedAt: null } : {}),
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
