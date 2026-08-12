import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * GET /api/vendor-master — daftar vendor untuk pilihan di Open Tiket.
 * Boleh semua role login.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const items = await prisma.vendorMaster.findMany({ orderBy: { nama: "asc" } });
  return NextResponse.json({ items });
}

/** POST /api/vendor-master — tambah vendor baru. Hanya Super Admin. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json(
      { error: "Hanya Super Admin yang dapat menambah vendor." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const nama = cleanStr(body?.nama);
  if (!nama) {
    return NextResponse.json({ error: "Nama vendor wajib diisi." }, { status: 400 });
  }

  try {
    const created = await prisma.vendorMaster.create({ data: { nama } });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Vendor ini sudah ada." }, { status: 409 });
    }
    throw e;
  }
}
