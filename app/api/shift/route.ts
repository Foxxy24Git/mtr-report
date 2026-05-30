import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/jwt";
import { ALL_SHIFTS, type ShiftCode } from "@/lib/shift";

/** POST /api/shift — set shift aktif sesi (dipilih dari Dashboard). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const shift = (body?.shift ?? "").trim();

  if (!ALL_SHIFTS.includes(shift as ShiftCode)) {
    return NextResponse.json({ error: "Shift tidak dikenal." }, { status: 400 });
  }

  const token = await signSession({
    sub: session.sub,
    username: session.username,
    nama: session.nama,
    role: session.role,
    shift,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, shift });
}
