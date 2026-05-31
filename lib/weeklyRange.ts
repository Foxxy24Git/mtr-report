import { fmtDateKey } from "@/lib/format";

const DAY_MS = 86_400_000;
// Batas atas rentang diperluas menjadi 1 tahun (PRD revisi §4) agar user bisa
// menelusuri riwayat permasalahan satu ATM dalam jangka panjang.
export const MAX_RANGE_DAYS = 366;

/** Validasi format YYYY-MM-DD. */
function isDateKey(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Resolusi rentang tanggal Weekly Monitoring (zona WIB) dengan default 7 hari
 * (rolling) dan batas maksimal 1 tahun inklusif. Mengembalikan instant batas
 * bawah/atas hari beserta kunci tanggal yang sudah dinormalisasi.
 */
export function resolveRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined
): { from: Date; to: Date; fromKey: string; toKey: string } {
  const now = Date.now();
  const toKey = isDateKey(toRaw) ? toRaw : fmtDateKey(new Date(now));
  let fromKey = isDateKey(fromRaw)
    ? fromRaw
    : fmtDateKey(new Date(now - 6 * DAY_MS));

  // Jaga from <= to.
  if (fromKey > toKey) fromKey = toKey;

  const toInstant = new Date(`${toKey}T23:59:59.999+07:00`);
  let fromInstant = new Date(`${fromKey}T00:00:00.000+07:00`);
  const spanDays = Math.round(
    (toInstant.getTime() - fromInstant.getTime()) / DAY_MS
  );
  if (spanDays >= MAX_RANGE_DAYS) {
    fromKey = fmtDateKey(
      new Date(toInstant.getTime() - (MAX_RANGE_DAYS - 1) * DAY_MS)
    );
    fromInstant = new Date(`${fromKey}T00:00:00.000+07:00`);
  }

  return { from: fromInstant, to: toInstant, fromKey, toKey };
}
