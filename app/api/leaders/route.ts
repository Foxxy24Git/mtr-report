import { NextResponse } from "next/server";
import { LeaderKategori, LeaderTipe } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isKategori(v: string): v is LeaderKategori {
  return v === LeaderKategori.infrastruktur || v === LeaderKategori.divisi;
}
function isTipe(v: string): v is LeaderTipe {
  return v === LeaderTipe.tetap || v === LeaderTipe.pjs;
}

/** GET /api/leaders — daftar pimpinan (semua role login, untuk dropdown & menu Leader). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const leaders = await prisma.leader.findMany({
    orderBy: [{ kategori: "asc" }, { nama: "asc" }],
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
  const kategori = cleanStr(body?.kategori);
  const tipe = cleanStr(body?.tipe) || LeaderTipe.tetap;
  const namaPjs = cleanStr(body?.namaPjs);
  const isAktif = body?.isAktif === undefined ? true : Boolean(body?.isAktif);

  if (!nama) {
    return NextResponse.json({ error: "Nama pimpinan wajib diisi." }, { status: 400 });
  }
  if (!jabatan) {
    return NextResponse.json({ error: "Jabatan wajib diisi." }, { status: 400 });
  }
  if (!isKategori(kategori)) {
    return NextResponse.json(
      { error: "Kategori harus 'infrastruktur' atau 'divisi'." },
      { status: 400 }
    );
  }
  if (!isTipe(tipe)) {
    return NextResponse.json({ error: "Tipe tidak valid." }, { status: 400 });
  }
  if (tipe === LeaderTipe.pjs && !namaPjs) {
    return NextResponse.json(
      { error: "Nama PJS wajib diisi bila tipe PJS." },
      { status: 400 }
    );
  }

  const created = await prisma.leader.create({
    data: {
      nama,
      jabatan,
      kategori,
      tipe,
      namaPjs: tipe === LeaderTipe.pjs ? namaPjs : null,
      isAktif,
    },
  });
  return NextResponse.json({ leader: created }, { status: 201 });
}
