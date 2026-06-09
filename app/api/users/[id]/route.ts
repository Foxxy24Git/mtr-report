import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/users/[id] — ubah akun User/Supervisi (Super Admin, PRD §3).
 * Semua field bisa diubah; password opsional (kosong = tidak diganti).
 * Tidak bisa menonaktifkan / mengubah role akun Super Admin.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const data: Prisma.UserUpdateInput = {};

  // Nama
  const nama = cleanStr(body?.nama);
  if (nama) data.nama = nama;

  // Username
  if (body?.username !== undefined) {
    const username = cleanStr(body.username).toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "Username wajib diisi." }, { status: 400 });
    }
    if (!/^[a-z0-9_.]+$/.test(username)) {
      return NextResponse.json(
        { error: "Username hanya boleh huruf kecil, angka, titik, atau garis bawah." },
        { status: 400 }
      );
    }
    data.username = username;
  }

  // Role — tidak boleh jadi superadmin; tidak boleh mengubah role superadmin.
  if (body?.role !== undefined) {
    const role = cleanStr(body.role);
    if (role !== Role.user && role !== Role.supervisi) {
      return NextResponse.json(
        { error: "Role harus 'user' atau 'supervisi'." },
        { status: 400 }
      );
    }
    if (target.role === Role.superadmin) {
      return NextResponse.json(
        { error: "Role akun Super Admin tidak dapat diubah." },
        { status: 400 }
      );
    }
    data.role = role as Role;
  }

  // Status aktif (soft delete) — Super Admin tidak bisa dinonaktifkan.
  if (typeof body?.isAktif === "boolean") {
    if (!body.isAktif && target.role === Role.superadmin) {
      return NextResponse.json(
        { error: "Akun Super Admin tidak dapat dinonaktifkan." },
        { status: 400 }
      );
    }
    data.isAktif = body.isAktif;
  }

  // Integrasi Telegram (Fase 2) — hanya Super Admin (route ini sudah dibatasi)
  // dan hanya untuk akun non-superadmin. String kosong → null (hapus setelan).
  if (body?.telegramChatId !== undefined) {
    if (target.role === Role.superadmin) {
      return NextResponse.json(
        { error: "Chat ID Telegram tidak berlaku untuk akun Super Admin." },
        { status: 400 }
      );
    }
    const chatId = cleanStr(body.telegramChatId);
    data.telegramChatId = chatId || null;
  }
  if (body?.telegramNomor !== undefined) {
    const nomor = cleanStr(body.telegramNomor);
    data.telegramNomor = nomor || null;
  }

  // Password (reset) — opsional.
  if (body?.password) {
    const password: string = body.password;
    if (password.length < 4) {
      return NextResponse.json(
        { error: "Password minimal 4 karakter." },
        { status: 400 }
      );
    }
    data.passwordHash = await hashPassword(password);
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        nama: true,
        role: true,
        fotoProfilUrl: true,
        ttdUrl: true,
        telegramChatId: true,
        telegramNomor: true,
        isAktif: true,
      },
    });
    return NextResponse.json({ user: updated });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Username sudah dipakai." },
        { status: 409 }
      );
    }
    throw e;
  }
}
