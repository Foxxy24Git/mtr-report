import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE, isSecureCookie } from "@/lib/jwt";
import {
  ALL_SHIFTS,
  isAkhirPekanWIB,
  shiftSessionStart,
  validShiftsForDate,
  type ShiftCode,
} from "@/lib/shift";
import { isShift12JamAktif } from "@/lib/shiftOverride";

/** POST /api/shift — set shift aktif sesi (dipilih dari Dashboard). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const shift = (body?.shift ?? "").trim();
  const supervisiIdInput =
    typeof body?.supervisiId === "string" ? body.supervisiId.trim() : "";

  if (!ALL_SHIFTS.includes(shift as ShiftCode)) {
    return NextResponse.json({ error: "Shift tidak dikenal." }, { status: 400 });
  }

  // Memilih shift yang sama dengan sesi yang sedang berjalan TIDAK memulai sesi
  // baru: awal sesi dipertahankan agar batas tiket Daily Monitoring tidak
  // bergeser (lihat shiftSessionStart di lib/shift.ts).
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { currentShift: true, shiftStartedAt: true, currentSupervisiId: true },
  });
  const now = new Date();
  const { startedAt, lanjutan } = shiftSessionStart(
    shift as ShiftCode,
    user?.currentShift,
    user?.shiftStartedAt,
    now
  );

  // Shift 12 jam (D/E) di hari kerja hanya boleh DIMULAI bila Super Admin
  // sudah mengaktifkan mode 12 jam untuk tanggal ini (kondisi darurat). Sesi
  // yang sudah berjalan (lanjutan, mis. shift E lewat tengah malam, atau
  // sekadar ganti Supervisi tanpa ganti shift) tidak divalidasi ulang di sini
  // — statusnya sudah sah sejak dimulai.
  if (!lanjutan) {
    const shift12JamAktif = await isShift12JamAktif(now);
    if (!validShiftsForDate(now, shift12JamAktif).includes(shift as ShiftCode)) {
      return NextResponse.json(
        {
          error: isAkhirPekanWIB(now)
            ? "Hari ini akhir pekan — hanya shift 12 jam (D/E) yang tersedia."
            : "Shift 12 jam (D/E) belum diaktifkan untuk hari ini. Hubungi Super Admin bila diperlukan.",
        },
        { status: 400 }
      );
    }
  }

  // supervisiId opsional per-request: kalau tidak dikirim (mis. petugas cuma
  // ganti shift lewat tombol tanpa menyentuh dropdown Supervisi), pertahankan
  // pilihan supervisi yang sudah tersimpan.
  let supervisiId = supervisiIdInput || user?.currentSupervisiId || "";
  if (supervisiIdInput) {
    const supervisi = await prisma.user.findFirst({
      where: { id: supervisiIdInput, role: "supervisi", isAktif: true },
      select: { id: true },
    });
    if (!supervisi) {
      return NextResponse.json({ error: "Supervisi tidak valid." }, { status: 400 });
    }
    supervisiId = supervisi.id;
  }

  // Persist shift aktif & awalnya ke DB (kolom Shift Aktif Dashboard Super Admin).
  await prisma.user.update({
    where: { id: session.sub },
    data: {
      currentShift: shift as ShiftKode,
      shiftStartedAt: startedAt,
      currentSupervisiId: supervisiId || null,
    },
  });

  // Tiket proses milik petugas ini ikut disamakan ke shift & Supervisi yang
  // baru dipilih — mencakup DUA kasus:
  // 1. Tiket yang sudah ada di shift baru sebelum Supervisi dipilih/diganti
  //    (mis. dibuka duluan, Supervisi baru dipilih belakangan). Pola sama
  //    seperti reassignment supervisiId saat serah terima shift
  //    (app/api/shift/handover/route.ts).
  // 2. Tiket yang MASIH tersimpan di shift LAMA saat petugas berganti shift
  //    tanpa serah terima formal (mis. Super Admin mengaktifkan shift 12 jam
  //    di hari kerja — lib/shiftOverride.ts — dan petugas pindah dari Shift
  //    Sore ke Shift Lembur Malam sendiri). Tanpa migrasi shiftKode ini,
  //    tiket tsb hilang dari "Tiket Open per Shift" (lib/dashboardQueries.ts)
  //    & Daily Monitoring, yang memfilter shiftKode = shift aktif sesi
  //    (lib/ticketQueries.ts).
  const shiftLama = user?.currentShift ?? null;
  const shiftKodesToSync = Array.from(
    new Set(
      !lanjutan && shiftLama && shiftLama !== shift
        ? [shift, shiftLama]
        : [shift]
    )
  ) as ShiftKode[];
  await prisma.ticket.updateMany({
    where: {
      ownerUserId: session.sub,
      shiftKode: { in: shiftKodesToSync },
      status: TicketStatus.proses,
    },
    data: {
      shiftKode: shift as ShiftKode,
      ...(supervisiId ? { supervisiId } : {}),
    },
  });

  const token = await signSession({
    sub: session.sub,
    username: session.username,
    nama: session.nama,
    role: session.role,
    shift,
    // Awal shift session — penanda batas tiket Daily Monitoring (PRD revisi
    // §4.B). Sengaja memakai nilai yang sama dengan yang ditulis ke DB agar
    // cookie & DB tidak pernah menyimpan waktu mulai yang berbeda.
    shiftStartedAt: startedAt.toISOString(),
    supervisiId,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, shift });
}
