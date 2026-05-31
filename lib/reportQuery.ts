import type { ShiftKode } from "@prisma/client";

export interface ReportTicketWhereParams {
  /** Awal hari (WIB) inklusif. */
  startWib: Date;
  /** Awal hari berikutnya (WIB) eksklusif. */
  endWib: Date;
  /** Shift laporan. Difilter via openShiftKode (shift asal, immutable). */
  shift?: ShiftKode | null;
  /** Batasi ke tiket milik satu user (laporan per-user). */
  ownerUserId?: string | null;
}

/**
 * Bangun klausa `where` Prisma untuk query tiket laporan.
 *
 * PENTING (FIX serah terima shift): filter shift memakai `openShiftKode`
 * — shift tempat tiket pertama di-open — BUKAN `shiftKode` yang dimutasi
 * ke shift berikutnya saat serah terima. Dengan begitu laporan shift A tetap
 * memuat tiket yang di-open pada shift A walau ownership/shift current berpindah.
 */
export function buildReportTicketWhere(
  p: ReportTicketWhereParams
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    waktuOpen: { gte: p.startWib, lt: p.endWib },
  };
  if (p.shift) where.openShiftKode = p.shift;
  if (p.ownerUserId) where.ownerUserId = p.ownerUserId;
  return where;
}
