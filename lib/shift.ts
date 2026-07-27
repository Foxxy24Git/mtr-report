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

/**
 * Batas usia sesi shift yang masih boleh dipulihkan saat login ulang: 12 jam.
 *
 * Ditulis sebagai konstanta lokal — BUKAN import SESSION_MAX_AGE dari
 * lib/jwt.ts — karena lib/shift.ts dipakai komponen klien ShiftSelector.tsx,
 * sehingga mengimpor lib/jwt.ts akan menarik paket `jose` ke bundle browser.
 * Nilainya harus dijaga tetap sama dengan SESSION_MAX_AGE (60 * 60 * 12 detik).
 */
export const SHIFT_RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface ResumedShiftSession {
  /** Kode shift (A–E), atau "" bila tidak ada sesi yang bisa dipulihkan. */
  shift: string;
  /** Awal sesi shift dalam ISO 8601, atau "" bila tidak ada. */
  shiftStartedAt: string;
}

/**
 * Tentukan sesi shift mana yang boleh dipulihkan saat petugas login kembali.
 *
 * Logout menutup sesi LOGIN, bukan sesi SHIFT: selama shift belum diserah-
 * terimakan atau ditutup, petugas harus dapat login ulang dan tetap memantau
 * serta mengedit tiketnya di Daily Monitoring. Sesi shift berakhir hanya lewat
 * serah terima / tutup laporan shift, yang mengosongkan currentShift &
 * shiftStartedAt di tabel users.
 *
 * Pengaman: sesi yang lebih tua dari SHIFT_RESUME_MAX_AGE_MS dianggap basi
 * (petugas lupa menutup shift) dan tidak dipulihkan — petugas diminta memilih
 * shift lagi di Dashboard.
 */
export function resumableShiftSession(
  currentShift: string | null | undefined,
  shiftStartedAt: Date | null | undefined,
  now: Date = new Date()
): ResumedShiftSession {
  const kosong: ResumedShiftSession = { shift: "", shiftStartedAt: "" };
  if (!currentShift || !ALL_SHIFTS.includes(currentShift as ShiftCode)) {
    return kosong;
  }
  if (!shiftStartedAt) return kosong;

  const mulai = shiftStartedAt.getTime();
  if (Number.isNaN(mulai)) return kosong;

  const usia = now.getTime() - mulai;
  // usia < 0 → waktu mulai di masa depan (jam server bergeser): jangan dipercaya.
  if (usia < 0 || usia > SHIFT_RESUME_MAX_AGE_MS) return kosong;

  return { shift: currentShift, shiftStartedAt: shiftStartedAt.toISOString() };
}
