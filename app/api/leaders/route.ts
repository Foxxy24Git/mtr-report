import { NextResponse } from "next/server";
import { LeaderJabatan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** GET /api/leaders — daftar pimpinan (semua role login, untuk dropdown & setting). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const leaders = await prisma.leader.findMany({
    orderBy: [{ jabatan: "asc" }, { nama: "asc" }],
  });
  return NextResponse.json({ leaders });
}

/** POST /api/leaders — tambah pimpinan Infrastruktur/Divisi (Super Admin). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nama = cleanStr(body?.nama);
  const jabatan = cleanStr(body?.jabatan);
  const isPjs = Boolean(body?.isPjs);

  if (!nama) {
    return NextResponse.json({ error: "Nama pimpinan wajib diisi." }, { status: 400 });
  }
  if (jabatan !== LeaderJabatan.infrastruktur && jabatan !== LeaderJabatan.divisi) {
    return NextResponse.json(
      { error: "Jabatan harus 'infrastruktur' atau 'divisi'." },
      { status: 400 }
    );
  }

  const created = await prisma.leader.create({
    data: { nama, jabatan: jabatan as LeaderJabatan, isPjs, aktif: true },
  });
  return NextResponse.json({ leader: created }, { status: 201 });
}
