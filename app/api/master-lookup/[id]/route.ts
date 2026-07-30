import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Hanya Super Admin & Monitoring (role user) yang boleh ubah master data gangguan. */
async function requireEditor() {
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
  return null;
}

/** PATCH /api/master-lookup/[id] — ubah nilai (tipe tidak dipindah). */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireEditor();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const nilai = cleanStr(body?.nilai);

  if (!nilai) {
    return NextResponse.json({ error: "Nilai tidak boleh kosong." }, { status: 400 });
  }

  try {
    const updated = await prisma.masterLookup.update({
      where: { id },
      data: { nilai },
    });
    return NextResponse.json({ item: updated });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });
      }
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: "Nilai ini sudah ada untuk kategori ini." },
          { status: 409 }
        );
      }
    }
    throw e;
  }
}

/**
 * DELETE /api/master-lookup/[id] — hapus nilai.
 * Aman untuk tiket lama: Ticket menyimpan string snapshot, bukan relasi FK.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireEditor();
  if (denied) return denied;

  const { id } = await params;

  try {
    await prisma.masterLookup.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });
    }
    throw e;
  }
}
