import { SHIFT_LABELS } from "@/lib/constants";
import { resolveLeaderName, type LeaderRef } from "@/lib/reportSignatures";

/** Label shift lengkap untuk laporan (mis. "Shift Pagi (07:00–15:00)"). */
export function getShiftLabel(shift: string): string {
  return SHIFT_LABELS[shift] ?? `Shift ${shift}`;
}

export interface ShiftReportSignerInput {
  ownerUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  receiverUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisi?: { nama?: string | null; ttdUrl?: string | null } | null;
  pimpinanInfra?: LeaderRef | null;
  pimpinanDivisi?: LeaderRef | null;
  /** "pending" | "approved" — TTD supervisi hanya tampil bila approved. */
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
  pimpinanInfra: string;
  pimpinanDivisi: string;
}

/**
 * Bangun blok tanda tangan laporan dari sebuah ShiftReport (PART 4).
 *
 * - Penyerah = owner shift; Penerima = penerima shift (kosong bila ditutup
 *   tanpa penerima).
 * - Nama supervisi selalu ikut; TTD supervisi hanya muncul saat status
 *   "approved".
 * - Pimpinan: tanpa TTD; nama mengikuti tipe (PJS → nama_pjs).
 */
export function resolveShiftReportSignatures(
  r: ShiftReportSignerInput
): ShiftReportSignatures {
  const approved = r.status === "approved";
  return {
    penyerah: r.ownerUser?.nama ?? "",
    penyerahTtdPath: r.ownerUser?.ttdUrl ?? null,
    penerima: r.receiverUser?.nama ?? "",
    penerimaTtdPath: r.receiverUser?.ttdUrl ?? null,
    supervisi: r.supervisi?.nama ?? "",
    supervisiApproved: approved,
    supervisiTtdPath: approved ? r.supervisi?.ttdUrl ?? null : null,
    pimpinanInfra: resolveLeaderName(r.pimpinanInfra),
    pimpinanDivisi: resolveLeaderName(r.pimpinanDivisi),
  };
}
