import { NextResponse } from "next/server";
import { LookupTipe } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const TIPE_VALUES = Object.values(LookupTipe) as string[];

/**
 * GET /api/lookup?tipe= — daftar master_lookup.
 * Tanpa `tipe`: kembalikan ketiga grup sekaligus (untuk form Open Tiket).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const tipe = new URL(req.url).searchParams.get("tipe");

  if (tipe) {
    if (!TIPE_VALUES.includes(tipe)) {
      return NextResponse.json({ error: "Tipe lookup tidak dikenal." }, { status: 400 });
    }
    const items = await prisma.masterLookup.findMany({
      where: { tipe: tipe as LookupTipe },
      orderBy: { nilai: "asc" },
      select: { id: true, nilai: true },
    });
    return NextResponse.json({ items });
  }

  const all = await prisma.masterLookup.findMany({
    orderBy: { nilai: "asc" },
    select: { id: true, tipe: true, nilai: true },
  });

  const grouped: Record<string, { id: string; nilai: string }[]> = {
    jenis_gangguan: [],
    sumber_penyebab: [],
    jenis_penanganan: [],
  };
  for (const row of all) {
    grouped[row.tipe].push({ id: row.id, nilai: row.nilai });
  }

  return NextResponse.json(grouped);
}
