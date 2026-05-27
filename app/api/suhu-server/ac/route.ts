import { NextResponse } from "next/server";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { normalizeUrutan, parseTanggal, todayKeyWIB } from "@/lib/suhuServer";

const SHIFTS = Object.values(ShiftKode) as string[];

function optStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function asBool(v: unknown): boolean {
  return v === true || v === "true";
}

/** POST /api/suhu-server/ac — simpan 1 pengecekan suhu AC (PRD §4.H). */
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

  const urutan = normalizeUrutan(body?.urutan);
  if (!urutan) {
    return NextResponse.json(
      { error: "Urutan pengecekan harus 1, 2, atau 3." },
      { status: 400 }
    );
  }

  const waktuRaw = optStr(body?.waktuPantau);
  if (!waktuRaw) {
    return NextResponse.json(
      { error: "Waktu pemantauan wajib diisi." },
      { status: 400 }
    );
  }
  const waktuPantau = new Date(waktuRaw);
  if (Number.isNaN(waktuPantau.getTime())) {
    return NextResponse.json(
      { error: "Waktu pemantauan tidak valid." },
      { status: 400 }
    );
  }

  const shiftKode = session.shift as ShiftKode;
  const data = {
    tanggal,
    shiftKode,
    userId: session.sub,
    urutan,
    waktuPantau,
    suhuRoomServer: optStr(body?.suhuRoomServer),
    suhuPanel: optStr(body?.suhuPanel),
    statusAktifKiri: asBool(body?.statusAktifKiri),
    statusAktifKanan: asBool(body?.statusAktifKanan),
    pantau12jamKiri: optStr(body?.pantau12jamKiri),
    pantau12jamKanan: optStr(body?.pantau12jamKanan),
  };

  // Upsert berbasis tanggal+shift+urutan (tidak ada unique constraint DB).
  const item = await prisma.$transaction(async (tx) => {
    const existing = await tx.acTempLog.findFirst({
      where: { tanggal, shiftKode, urutan },
      select: { id: true },
    });
    if (existing) {
      return tx.acTempLog.update({ where: { id: existing.id }, data });
    }
    return tx.acTempLog.create({ data });
  });

  return NextResponse.json({ item }, { status: 201 });
}
