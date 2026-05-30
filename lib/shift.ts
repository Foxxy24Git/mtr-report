export type ShiftCode = "A" | "B" | "C" | "D" | "E";

/** Semua shift selalu dapat dipilih kapan saja (tidak dibatasi hari). */
export const ALL_SHIFTS: ShiftCode[] = ["A", "B", "C", "D", "E"];

/**
 * Aturan transisi shift otomatis untuk serah terima.
 * Siklus A→B→C→A dan D→E→D dipertahankan agar mapping next-shift jelas.
 */
export const NEXT_SHIFT: Record<ShiftCode, ShiftCode> = {
  A: "B",
  B: "C",
  C: "A",
  D: "E",
  E: "D",
};

/** Shift berikutnya dari shift aktif saat ini. */
export function nextShift(shift: ShiftCode): ShiftCode {
  return NEXT_SHIFT[shift];
}
