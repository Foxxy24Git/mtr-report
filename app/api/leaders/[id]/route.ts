import { NextResponse } from "next/server";
import { LeaderKategori, LeaderTipe, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** PATCH /api/leaders/[id] — ubah nama/jabatan/kategori/tipe/nama_pjs/aktif (Super Admin). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const current = await prisma.leader.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Pimpinan tidak ditemukan." }, { status: 404 });
  }

  const data: Prisma.LeaderUpdateInput = {};

  if (typeof body?.nama === "string") {
    const nama = cleanStr(body.nama);
    if (!nama) {
      return NextResponse.json({ error: "Nama tidak boleh kosong." }, { status: 400 });
    }
    data.nama = nama;
  }
  if (typeof body?.jabatan === "string") {
    const jabatan = cleanStr(body.jabatan);
    if (!jabatan) {
      return NextResponse.json({ error: "Jabatan tidak boleh kosong." }, { status: 400 });
    }
    data.jabatan = jabatan;
  }
  if (typeof body?.kategori === "string") {
    const k = cleanStr(body.kategori);
    if (k !== LeaderKategori.infrastruktur && k !== LeaderKategori.divisi) {
      return NextResponse.json({ error: "Kategori tidak valid." }, { status: 400 });
    }
    data.kategori = k as LeaderKategori;
  }

  // Tipe + nama PJS saling terkait.
  const nextTipe =
    typeof body?.tipe === "string" ? cleanStr(body.tipe) : current.tipe;
  if (typeof body?.tipe === "string") {
    if (nextTipe !== LeaderTipe.tetap && nextTipe !== LeaderTipe.pjs) {
      return NextResponse.json({ error: "Tipe tidak valid." }, { status: 400 });
    }
    data.tipe = nextTipe as LeaderTipe;
  }
  if (nextTipe === LeaderTipe.pjs) {
    const namaPjs =
      typeof body?.namaPjs === "string" ? cleanStr(body.namaPjs) : current.namaPjs ?? "";
    if (!namaPjs) {
      return NextResponse.json(
        { error: "Nama PJS wajib diisi bila tipe PJS." },
        { status: 400 }
      );
    }
    data.namaPjs = namaPjs;
  } else {
    // tipe tetap → kosongkan nama PJS
    data.namaPjs = null;
  }

  // Aturan: minimal 1 pimpinan aktif per kategori — tidak boleh nonaktifkan
  // (atau memindahkan kategori) pimpinan aktif terakhir.
  if (typeof body?.isAktif === "boolean") {
    data.isAktif = body.isAktif;
  }
  const willDeactivate =
    current.isAktif &&
    (data.isAktif === false ||
      (data.kategori !== undefined && data.kategori !== current.kategori));
  if (willDeactivate) {
    const lainAktif = await prisma.leader.count({
      where: { kategori: current.kategori, isAktif: true, id: { not: id } },
    });
    if (lainAktif === 0) {
      const label =
        current.kategori === LeaderKategori.infrastruktur ? "Infrastruktur" : "Divisi";
      return NextResponse.json(
        {
          error: `Minimal 1 pimpinan aktif untuk kategori ${label}. Aktifkan pimpinan lain dulu.`,
        },
        { status: 409 }
      );
    }
  }

  try {
    const updated = await prisma.leader.update({ where: { id }, data });
    return NextResponse.json({ leader: updated });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Pimpinan tidak ditemukan." }, { status: 404 });
    }
    throw e;
  }
}

/** DELETE /api/leaders/[id] — hapus pimpinan (Super Admin). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Hanya Super Admin." }, { status: 403 });
  }
  const { id } = await params;

  const current = await prisma.leader.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Pimpinan tidak ditemukan." }, { status: 404 });
  }

  // Jaga minimal 1 pimpinan aktif per kategori.
  if (current.isAktif) {
    const lainAktif = await prisma.leader.count({
      where: { kategori: current.kategori, isAktif: true, id: { not: id } },
    });
    if (lainAktif === 0) {
      const label =
        current.kategori === LeaderKategori.infrastruktur ? "Infrastruktur" : "Divisi";
      return NextResponse.json(
        {
          error: `Minimal 1 pimpinan aktif untuk kategori ${label}. Tambah pimpinan lain dulu.`,
        },
        { status: 409 }
      );
    }
  }

  try {
    await prisma.leader.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Pimpinan tidak ditemukan." }, { status: 404 });
      }
      if (e.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "Pimpinan masih dipakai pada tiket/serah terima. Nonaktifkan saja alih-alih menghapus.",
          },
          { status: 409 }
        );
      }
    }
    throw e;
  }
}
