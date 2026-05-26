import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optStr(v: unknown): string | null {
  const s = cleanStr(v);
  return s.length ? s : null;
}

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/atm/[id] — ubah master ATM. */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const kodeAtm = cleanStr(body?.kodeAtm);
  const namaAtm = cleanStr(body?.namaAtm);
  if (!kodeAtm || !namaAtm) {
    return NextResponse.json(
      { error: "ID/Kode ATM dan Nama ATM wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.atmMaster.update({
      where: { id },
      data: {
        kodeAtm,
        namaAtm,
        cabang: optStr(body?.cabang),
        alamat: optStr(body?.alamat),
        vendorAtm: optStr(body?.vendorAtm),
        vendorJaringan: optStr(body?.vendorJaringan),
      },
    });
    return NextResponse.json({ item: updated });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: `Kode ATM "${kodeAtm}" sudah terdaftar.` },
          { status: 409 }
        );
      }
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Data ATM tidak ditemukan." }, { status: 404 });
      }
    }
    throw e;
  }
}

/** DELETE /api/atm/[id] — hapus master ATM. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;

  const ticketCount = await prisma.ticket.count({ where: { atmId: id } });
  if (ticketCount > 0) {
    return NextResponse.json(
      { error: `Tidak bisa dihapus: ${ticketCount} tiket masih memakai ATM ini.` },
      { status: 409 }
    );
  }

  try {
    await prisma.atmMaster.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "Data ATM tidak ditemukan." }, { status: 404 });
    }
    throw e;
  }
}
