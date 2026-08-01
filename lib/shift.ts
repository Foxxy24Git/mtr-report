export type ShiftCode = "A" | "B" | "C" | "D" | "E";

/** Semua shift selalu dapat dipilih kapan saja (tidak dibatasi hari). */
export const ALL_SHIFTS: ShiftCode[] = ["A", "B", "C", "D", "E"];

/**
 * Aturan transisi shift otomatis untuk serah terima.
 * Siklus A→B→C→A dan D→E→D dipertahankan agar mapping next-shift jelas.
 *
 * Berlaku apa adanya HANYA untuk shift yang berakhir di hari yang sama dengan
 * awalnya (A, B, D). Untuk C dan E — satu-satunya shift yang melewati tengah
 * malam — tujuan ditentukan {@link nextShift} berdasarkan hari saat serah
 * terima terjadi; nilai di sini adalah tujuan hari-kerja/akhir-pekannya.
 */
export const NEXT_SHIFT: Record<ShiftCode, ShiftCode> = {
  A: "B",
  B: "C",
  C: "A",
  D: "E",
  E: "D",
};

const TZ = "Asia/Jakarta";
const WEEKEND = new Set(["Sat", "Sun"]);

/**
 * True bila `now` jatuh pada Sabtu/Minggu menurut jam dinding WIB.
 *
 * Memakai WIB (Asia/Jakarta) — bukan jam lokal server — agar tetap benar walau
 * kontainer berjalan di UTC (pola sama dengan bolehKirimNotif di
 * lib/telegramNotif.ts).
 */
function isAkhirPekanWIB(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(now);
  return WEEKEND.has(weekday);
}

/**
 * Shift berikutnya dari shift aktif saat ini.
 *
 * Shift C (Malam, 23:00–07:00) dan E (Lembur Malam, 19:00–07:00) berakhir pada
 * HARI BERIKUTNYA, sehingga tujuannya tidak bisa statis: yang menentukan adalah
 * hari yang baru dimulai saat serah terima (WIB).
 * - Berakhir di Sabtu/Minggu → siklus akhir pekan, lanjut ke D (Lembur Pagi).
 *   Contoh: C Jumat malam berakhir Sabtu 07:00 → D.
 * - Berakhir di hari kerja → kembali ke siklus hari kerja, lanjut ke A (Pagi).
 *   Contoh: E Minggu malam berakhir Senin 07:00 → A.
 *
 * Shift A, B, dan D berakhir di hari yang sama dengan awalnya sehingga tetap
 * memakai NEXT_SHIFT statis.
 */
export function nextShift(shift: ShiftCode, now: Date = new Date()): ShiftCode {
  if (shift === "C" || shift === "E") {
    return isAkhirPekanWIB(now) ? "D" : "A";
  }
  return NEXT_SHIFT[shift];
}

/**
 * Batas usia sesi shift yang masih boleh dipulihkan saat login ulang: 16 jam.
 *
 * Diturunkan dari shift lembur terpanjang — D & E di lib/constants.ts, masing-
 * masing 12 jam — ditambah 4 jam kelonggaran untuk serah terima yang molor.
 * Batas 12 jam yang lama persis sama dengan panjang shift D/E, sehingga
 * petugas yang login ulang tepat pada jam serah terima gagal memulihkan
 * sesinya dan kehilangan tiketnya sendiri dari Daily Monitoring.
 *
 * Ditulis sebagai konstanta lokal — BUKAN import SESSION_MAX_AGE dari
 * lib/jwt.ts — karena lib/shift.ts dipakai komponen klien ShiftSelector.tsx,
 * sehingga mengimpor lib/jwt.ts akan menarik paket `jose` ke bundle browser.
 * Umur cookie (SESSION_MAX_AGE, parameter keamanan auth) dan umur sesi shift
 * (parameter proses bisnis di atas) adalah dua hal berbeda yang tidak perlu
 * disamakan.
 */
export const SHIFT_RESUME_MAX_AGE_MS = 16 * 60 * 60 * 1000;

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
