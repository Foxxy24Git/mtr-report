import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** GET /api/users — daftar pengguna (Super Admin). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      nama: true,
      role: true,
      fotoProfilUrl: true,
      ttdUrl: true,
      isAktif: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

/** POST /api/users — tambah pengguna baru, role user/supervisi (Super Admin). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const username = cleanStr(body?.username).toLowerCase();
  const nama = cleanStr(body?.nama);
  const role = cleanStr(body?.role);
  const password: string = body?.password ?? "";

  if (!username || !nama || !password) {
    return NextResponse.json(
      { error: "Username, nama, dan password wajib diisi." },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    return NextResponse.json(
      { error: "Username hanya boleh huruf kecil, angka, titik, atau garis bawah." },
      { status: 400 }
    );
  }
  if (password.length < 4) {
    return NextResponse.json(
      { error: "Password minimal 4 karakter." },
      { status: 400 }
    );
  }
  // Hanya boleh membuat role user atau supervisi (bukan superadmin).
  if (role !== Role.user && role !== Role.supervisi) {
    return NextResponse.json(
      { error: "Role harus 'user' atau 'supervisi'." },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.user.create({
      data: {
        username,
        nama,
        role: role as Role,
        passwordHash: await hashPassword(password),
        isAktif: typeof body?.isAktif === "boolean" ? body.isAktif : true,
      },
      select: {
        id: true,
        username: true,
        nama: true,
        role: true,
        isAktif: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `Username "${username}" sudah dipakai.` },
        { status: 409 }
      );
    }
    throw e;
  }
}
