import { TicketStatus, type ShiftKode } from "@prisma/client";

export interface ReportTicketWhereParams {
  /** Awal hari (WIB) inklusif. */
  startWib: Date;
  /** Awal hari berikutnya (WIB) eksklusif. */
  endWib: Date;
  /** Shift laporan. Difilter via openShiftKode (shift asal, immutable). */
  shift?: ShiftKode | null;
  /** Batasi ke tiket milik satu user (laporan per-user). */
  ownerUserId?: string | null;
  /**
   * Ikut sertakan tiket warisan tindak lanjut dari shift sebelumnya (opt-in,
   * default OFF). Bila true DAN `shift` diisi, where menjadi OR antara tiket
   * asli shift ini (openShiftKode, perilaku lama) dan tiket proses yang masih
   * ditangani shift ini via handover (shiftKode current + isTindakLanjutFlag),
   * mirror pola lib/ticketQueries.ts listTickets() cabang dailyMonitoring.
   */
  includeCarryOver?: boolean;
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
  if (p.shift && p.includeCarryOver) {
    const ownerFilter = p.ownerUserId ? { ownerUserId: p.ownerUserId } : {};
    return {
      OR: [
        {
          waktuOpen: { gte: p.startWib, lt: p.endWib },
          openShiftKode: p.shift,
          ...ownerFilter,
        },
        {
          shiftKode: p.shift,
          status: TicketStatus.proses,
          activities: { some: { isTindakLanjutFlag: true } },
          ...ownerFilter,
        },
      ],
    };
  }

  const where: Record<string, unknown> = {
    waktuOpen: { gte: p.startWib, lt: p.endWib },
  };
  if (p.shift) where.openShiftKode = p.shift;
  if (p.ownerUserId) where.ownerUserId = p.ownerUserId;
  return where;
}

export interface ReportTicketActivityLike {
  waktu: Date;
  isTindakLanjutFlag: boolean;
}

/**
 * Batasi log kegiatan tiket carry-over ke bagian milik shift laporan ini
 * saja: mulai dari marker isTindakLanjutFlag=true PALING BARU (titik tiket
 * resmi masuk tanggung jawab shift ini) sampai akhir. Kegiatan sebelum
 * marker itu milik shift sebelumnya dan dibuang. Tiket non-carry-over tidak
 * difilter sama sekali.
 */
export function filterActivitiesForShiftReport<
  T extends ReportTicketActivityLike
>(activities: T[], isCarryOver: boolean): T[] {
  if (!isCarryOver) return activities;
  const markers = activities.filter((a) => a.isTindakLanjutFlag);
  if (markers.length === 0) return activities;
  const entryTime = markers[markers.length - 1].waktu;
  return activities.filter((a) => a.waktu >= entryTime);
}
