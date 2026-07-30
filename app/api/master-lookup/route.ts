import { NextResponse } from "next/server";
import { LookupTipe, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isTipe(v: string): v is LookupTipe {
  return (
    v === LookupTipe.jenis_gangguan ||
    v === LookupTipe.sumber_penyebab ||
    v === LookupTipe.jenis_penanganan
  );
}

/**
 * GET /api/master-lookup — daftar nilai master dropdown Open Tiket.
 * Boleh semua role login (dipakai juga sebagai sumber dropdown).
 * Query opsional: ?tipe=jenis_gangguan
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const tipeParam = new URL(req.url).searchParams.get("tipe");
  if (tipeParam && !isTipe(tipeParam)) {
    return NextResponse.json({ error: "Tipe tidak valid." }, { status: 400 });
  }

  const items = await prisma.masterLookup.findMany({
    where: tipeParam ? { tipe: tipeParam as LookupTipe } : undefined,
    orderBy: [{ tipe: "asc" }, { nilai: "asc" }],
  });
  return NextResponse.json({ items });
}

/** POST /api/master-lookup — tambah nilai baru untuk sebuah tipe (Super Admin & Monitoring). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin" && session.role !== "user") {
    return NextResponse.json(
      { error: "Tidak berhak mengubah data gangguan." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const tipe = cleanStr(body?.tipe);
  const nilai = cleanStr(body?.nilai);

  if (!isTipe(tipe)) {
    return NextResponse.json({ error: "Tipe tidak valid." }, { status: 400 });
  }
  if (!nilai) {
    return NextResponse.json({ error: "Nilai wajib diisi." }, { status: 400 });
  }

  try {
    const created = await prisma.masterLookup.create({
      data: { tipe: tipe as LookupTipe, nilai },
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    // Unique constraint [tipe, nilai]
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Nilai ini sudah ada untuk kategori ini." },
        { status: 409 }
      );
    }
    throw e;
  }
}
