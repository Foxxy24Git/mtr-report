import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** GET /api/atm?q=&limit= — daftar/pencarian ATM (kode atau nama). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limitRaw = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

  const where: Prisma.AtmMasterWhereInput = q
    ? {
        OR: [
          { kodeAtm: { contains: q, mode: "insensitive" } },
          { namaAtm: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const items = await prisma.atmMaster.findMany({
    where,
    orderBy: { kodeAtm: "asc" },
    take: limit,
  });

  return NextResponse.json({ items });
}

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optStr(v: unknown): string | null {
  const s = cleanStr(v);
  return s.length ? s : null;
}

/** POST /api/atm — tambah master ATM/jaringan. Semua user login boleh. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

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
    const created = await prisma.atmMaster.create({
      data: {
        kodeAtm,
        namaAtm,
        cabang: optStr(body?.cabang),
        alamat: optStr(body?.alamat),
        vendorAtm: optStr(body?.vendorAtm),
        vendorJaringan: optStr(body?.vendorJaringan),
      },
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `Kode ATM "${kodeAtm}" sudah terdaftar.` },
        { status: 409 }
      );
    }
    throw e;
  }
}
