import { NextResponse } from "next/server";
import { LeaderJabatan, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** PATCH /api/leaders/[id] — ubah nama/jabatan/PJS/aktif (Super Admin). */
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

  const data: Prisma.LeaderUpdateInput = {};
  if (typeof body?.nama === "string") {
    const nama = cleanStr(body.nama);
    if (!nama) {
      return NextResponse.json({ error: "Nama tidak boleh kosong." }, { status: 400 });
    }
    data.nama = nama;
  }
  if (typeof body?.jabatan === "string") {
    const j = cleanStr(body.jabatan);
    if (j !== LeaderJabatan.infrastruktur && j !== LeaderJabatan.divisi) {
      return NextResponse.json({ error: "Jabatan tidak valid." }, { status: 400 });
    }
    data.jabatan = j as LeaderJabatan;
  }
  if (typeof body?.isPjs === "boolean") data.isPjs = body.isPjs;
  if (typeof body?.aktif === "boolean") data.aktif = body.aktif;

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
              "Pimpinan masih dipakai pada tiket. Nonaktifkan saja (set tidak aktif) alih-alih menghapus.",
          },
          { status: 409 }
        );
      }
    }
    throw e;
  }
}
