import { NextResponse } from "next/server";
import { ServerFase, ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isValidFase, parseTanggal, todayKeyWIB } from "@/lib/suhuServer";

const SHIFTS = Object.values(ShiftKode) as string[];

function optStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

/** POST /api/suhu-server/server — simpan log server 1 fase (awal/akhir) (PRD §4.H). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role === "supervisi") {
    return NextResponse.json(
      { error: "Supervisi tidak dapat mengisi log." },
      { status: 403 }
    );
  }
  if (!SHIFTS.includes(session.shift)) {
    return NextResponse.json(
      { error: "Shift sesi tidak valid. Silakan login ulang." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);

  const tanggal = parseTanggal(body?.tanggal ?? todayKeyWIB());
  if (!tanggal) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }

  if (!isValidFase(body?.fase)) {
    return NextResponse.json(
      { error: "Fase harus 'awal' atau 'akhir'." },
      { status: 400 }
    );
  }
  const fase = body.fase as ServerFase;

  const shiftKode = session.shift as ShiftKode;
  const data = {
    tanggal,
    shiftKode,
    userId: session.sub,
    fase,
    npay: optStr(body?.npay),
    ajAtmb: optStr(body?.ajAtmb),
    bifast: optStr(body?.bifast),
    prima: optStr(body?.prima),
    cipHost: optStr(body?.cipHost),
  };

  // Upsert berbasis tanggal+shift+fase (tidak ada unique constraint DB).
  const item = await prisma.$transaction(async (tx) => {
    const existing = await tx.serverLog.findFirst({
      where: { tanggal, shiftKode, fase },
      select: { id: true },
    });
    if (existing) {
      return tx.serverLog.update({ where: { id: existing.id }, data });
    }
    return tx.serverLog.create({ data });
  });

  return NextResponse.json({ item }, { status: 201 });
}
