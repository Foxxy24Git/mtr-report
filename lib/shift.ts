export type ShiftCode = "A" | "B" | "C" | "D" | "E";

/** Shift hari kerja (Senin–Jumat) — 3 shift. */
export const WEEKDAY_SHIFTS: ShiftCode[] = ["A", "B", "C"];

/** Shift akhir pekan (Sabtu–Minggu) — 2 shift. */
export const WEEKEND_SHIFTS: ShiftCode[] = ["D", "E"];

export const ALL_SHIFTS: ShiftCode[] = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];

/** Sabtu (6) atau Minggu (0) berdasarkan waktu lokal. */
export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

/** Daftar shift yang valid untuk tanggal tertentu (PRD §3). */
export function validShiftsForDate(date: Date): ShiftCode[] {
  return isWeekend(date) ? WEEKEND_SHIFTS : WEEKDAY_SHIFTS;
}

/** True jika kode shift valid untuk tanggal tersebut. */
export function isShiftValidForDate(shift: string, date: Date): boolean {
  return (validShiftsForDate(date) as string[]).includes(shift);
}
