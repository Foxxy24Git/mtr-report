import { prisma } from "@/lib/prisma";
import type { ShiftKode } from "@prisma/client";
import { resolveReportDateWindow } from "@/lib/reportQuery";
import { SHIFT_RESUME_MAX_AGE_MS } from "@/lib/shift";
import { fmtDateKey } from "@/lib/format";

const ALL_SHIFT_CODES: ShiftKode[] = ["A", "B", "C", "D", "E"];

export interface ShiftMatch {
  shift: ShiftKode;
  /** true bila sesi masih berjalan (belum ditutup/serah terima). */
  live: boolean;
}

export interface ShiftReportLike {
  shiftKode: ShiftKode;
  tanggal: Date;
}

export interface LiveSessionLike {
  currentShift: ShiftKode | null;
  shiftStartedAt: Date | null;
}

/**
 * Fungsi MURNI: cocokkan (tanggal, laporan shift yang sudah ditutup, sesi
 * yang masih berjalan) ke daftar shift yang match. Dipisah dari pengambilan
 * data (findUserShiftsForDate) supaya bisa diuji tanpa database.
 *
 * "Sudah ditutup": ShiftReport.tanggal (instant tutup) dicocokkan ke jendela
 * NOMINAL tiap shift (resolveReportDateWindow) + toleransi keterlambatan
 * tutup sebesar SHIFT_RESUME_MAX_AGE_MS (16 jam -- konstanta yang SAMA
 * dipakai untuk pemulihan sesi login, sengaja dipakai ulang bukan angka
 * baru). "Masih berjalan": currentShift/shiftStartedAt user, dicocokkan
 * lewat tanggal KALENDER (WIB) mulai sesi -- bukan jendela nominal, karena
 * shiftStartedAt adalah waktu MULAI SESUNGGUHNYA (bisa meleset sedikit dari
 * jadwal nominal).
 */
export function matchShiftsForDate(
  tanggal: string,
  closedReports: ShiftReportLike[],
  liveSession: LiveSessionLike | null
): ShiftMatch[] {
  const matches: ShiftMatch[] = [];
  for (const code of ALL_SHIFT_CODES) {
    const { startWib } = resolveReportDateWindow(tanggal, code, true);
    const maxClose = new Date(startWib.getTime() + SHIFT_RESUME_MAX_AGE_MS);
    const hit = closedReports.some(
      (r) => r.shiftKode === code && r.tanggal >= startWib && r.tanggal < maxClose
    );
    if (hit) matches.push({ shift: code, live: false });
  }
  if (
    liveSession?.currentShift &&
    liveSession.shiftStartedAt &&
    fmtDateKey(liveSession.shiftStartedAt) === tanggal &&
    !matches.some((m) => m.shift === liveSession.currentShift)
  ) {
    matches.push({ shift: liveSession.currentShift, live: true });
  }
  return matches;
}

/**
 * Ambil data lalu panggil matchShiftsForDate. Sisi yang menyentuh Prisma --
 * TIDAK diunit-test (butuh DB, sama seperti gatherReportData); verifikasi
 * lewat smoke test, bukan vitest.
 */
export async function findUserShiftsForDate(
  ownerUserId: string,
  tanggal: string
): Promise<ShiftMatch[]> {
  const dayStart = new Date(`${tanggal}T00:00:00+07:00`);
  const searchTo = new Date(
    dayStart.getTime() + 24 * 60 * 60 * 1000 + SHIFT_RESUME_MAX_AGE_MS
  );
  const [closedReports, user] = await Promise.all([
    prisma.shiftReport.findMany({
      where: { ownerUserId, tanggal: { gte: dayStart, lt: searchTo } },
      select: { shiftKode: true, tanggal: true },
    }),
    prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { currentShift: true, shiftStartedAt: true },
    }),
  ]);
  return matchShiftsForDate(tanggal, closedReports, user);
}
