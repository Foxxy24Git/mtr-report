import { NextResponse } from "next/server";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseTanggal, todayKeyWIB } from "@/lib/suhuServer";

const SHIFTS = Object.values(ShiftKode) as string[];

/**
 * GET /api/suhu-server?tanggal=YYYY-MM-DD&shift=A
 * Ringkasan log Suhu AC & Server untuk satu tanggal+shift (PRD §4.H).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const tanggal = parseTanggal(sp.get("tanggal") ?? todayKeyWIB());
  if (!tanggal) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }

  const shift = sp.get("shift") ?? "";
  if (!SHIFTS.includes(shift)) {
    return NextResponse.json({ error: "Shift tidak valid." }, { status: 400 });
  }

  const [acLogs, serverLogs] = await Promise.all([
    prisma.acTempLog.findMany({
      where: { tanggal, shiftKode: shift as ShiftKode },
      orderBy: { urutan: "asc" },
    }),
    prisma.serverLog.findMany({
      where: { tanggal, shiftKode: shift as ShiftKode },
    }),
  ]);

  return NextResponse.json({ acLogs, serverLogs });
}
