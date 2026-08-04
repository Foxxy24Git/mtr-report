import { SHIFT_LABELS } from "@/lib/constants";
import { resolveLeaderName, type LeaderRef } from "@/lib/reportSignatures";
import { shiftPakaiSupervisiNext } from "@/lib/shiftReportApproval";

/** Label shift lengkap untuk laporan (mis. "Shift Pagi (07:00–15:00)"). */
export function getShiftLabel(shift: string): string {
  return SHIFT_LABELS[shift] ?? `Shift ${shift}`;
}

export interface ShiftReportSignerInput {
  /** Kode shift laporan — penentu apakah blok kolom L dicetak (C/E saja). */
  shiftKode: string;
  ownerUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  receiverUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisi?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisiNext?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisiNextId?: string | null;
  pimpinanInfra?: LeaderRef | null;
  pimpinanDivisi?: LeaderRef | null;
  /**
   * Waktu approve supervisi UTAMA — gate TTD supervisi utama.
   *
   * Sengaja BUKAN `status`: sejak approval ganda, `status` baru "approved"
   * setelah supervisi selanjutnya ikut approve, sehingga memakainya akan
   * menyembunyikan TTD supervisi utama yang sebenarnya sudah sah.
   */
  approvedAt?: Date | null;
  /** Waktu approve supervisi selanjutnya — gate TTD blok kolom L. */
  supervisiNextApprovedAt?: Date | null;
  /** "pending" | "approved" — fallback bila `approvedAt` tidak dikirim. */
  status: string;
}

export interface ShiftReportSignatures {
  penyerah: string;
  penyerahTtdPath: string | null;
  penerima: string;
  penerimaTtdPath: string | null;
  supervisi: string;
  supervisiApproved: boolean;
  supervisiTtdPath: string | null;
  /** True untuk shift C & E → blok TTD kolom L ikut dicetak. */
  showSupervisiNext: boolean;
  supervisiNext: string;
  supervisiNextApproved: boolean;
  supervisiNextTtdPath: string | null;
  pimpinanInfra: string;
  pimpinanDivisi: string;
}

/**
 * Bangun blok tanda tangan laporan dari sebuah ShiftReport (PART 4).
 *
 * - Penyerah = owner shift; Penerima = penerima shift (kosong bila ditutup
 *   tanpa penerima).
 * - Nama supervisi selalu ikut; TTD-nya hanya muncul setelah peran itu approve.
 * - Blok "Supervisi Selanjutnya" (kolom L) hanya untuk shift C & E, dan TETAP
 *   dicetak walau namanya kosong (data lama) supaya bisa ditandatangani manual.
 * - Pimpinan: tanpa TTD; nama mengikuti tipe (PJS → nama_pjs).
 */
export function resolveShiftReportSignatures(
  r: ShiftReportSignerInput
): ShiftReportSignatures {
  const approvedUtama =
    r.approvedAt !== undefined ? r.approvedAt !== null : r.status === "approved";
  const approvedNext = Boolean(r.supervisiNextApprovedAt);
  const showNext = shiftPakaiSupervisiNext(r.shiftKode);
  return {
    penyerah: r.ownerUser?.nama ?? "",
    penyerahTtdPath: r.ownerUser?.ttdUrl ?? null,
    penerima: r.receiverUser?.nama ?? "",
    penerimaTtdPath: r.receiverUser?.ttdUrl ?? null,
    supervisi: r.supervisi?.nama ?? "",
    supervisiApproved: approvedUtama,
    supervisiTtdPath: approvedUtama ? r.supervisi?.ttdUrl ?? null : null,
    showSupervisiNext: showNext,
    supervisiNext: showNext ? r.supervisiNext?.nama ?? "" : "",
    supervisiNextApproved: showNext && approvedNext,
    supervisiNextTtdPath:
      showNext && approvedNext ? r.supervisiNext?.ttdUrl ?? null : null,
    pimpinanInfra: resolveLeaderName(r.pimpinanInfra),
    pimpinanDivisi: resolveLeaderName(r.pimpinanDivisi),
  };
}
