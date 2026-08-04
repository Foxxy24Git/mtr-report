/**
 * Aturan approval GANDA laporan shift malam (spec 2026-08-05).
 *
 * Shift C (23:00–07:00) & E (19:00–07:00) melewati tengah malam, sehingga tiket
 * yang masih proses diteruskan ke supervisi lain. Lembar manual Form OPS-001
 * untuk kedua shift itu punya blok tanda tangan ke-6 ("Supervisi Selanjutnya",
 * kolom L) yang tidak ada di shift A/B.
 *
 * Modul MURNI: tanpa Prisma dan tanpa "server-only", supaya seluruh aturannya
 * bisa diuji unit tanpa database DAN dipakai dari komponen klien. Pola yang
 * sama dengan lib/reportSignatures.ts.
 */

/** Shift malam yang laporannya punya blok "Supervisi Selanjutnya". */
export const SHIFT_SUPERVISI_NEXT: ReadonlySet<string> = new Set(["C", "E"]);

export function shiftPakaiSupervisiNext(shiftKode: string): boolean {
  return SHIFT_SUPERVISI_NEXT.has(shiftKode);
}

/** Identitas penanda tangan sebuah laporan shift. */
export interface ApprovalRefs {
  shiftKode: string;
  supervisiId?: string | null;
  supervisiNextId?: string | null;
}

/**
 * True bila laporan ini WAJIB di-approve juga oleh supervisi selanjutnya.
 *
 * Sengaja mengecek shiftKode DAN supervisiNextId: dropdown "Supervisi
 * Selanjutnya" dulu tampil di semua shift, jadi laporan lama shift A/B/D bisa
 * saja punya supervisiNextId. Laporan itu tidak boleh mendadak butuh approval
 * kedua dan macet di status pending selamanya.
 */
export function butuhApprovalSupervisiNext(r: ApprovalRefs): boolean {
  return shiftPakaiSupervisiNext(r.shiftKode) && Boolean(r.supervisiNextId);
}

export type PeranApproval = "utama" | "selanjutnya" | "keduanya" | null;

/**
 * Peran seorang user terhadap sebuah laporan. "keduanya" bila orang yang sama
 * dipilih sebagai supervisi utama DAN supervisi selanjutnya — kasus nyata pada
 * lembar manual 01-08-2026 19-07 (I27 == L27). Satu klik approve menuntaskan
 * dua-duanya (lihat route approve).
 */
export function resolvePeranApproval(
  r: ApprovalRefs,
  userId: string
): PeranApproval {
  const utama = Boolean(r.supervisiId) && r.supervisiId === userId;
  const next = butuhApprovalSupervisiNext(r) && r.supervisiNextId === userId;
  if (utama && next) return "keduanya";
  if (utama) return "utama";
  if (next) return "selanjutnya";
  return null;
}

export interface ApprovalState extends ApprovalRefs {
  approvedAt?: Date | null;
  supervisiNextApprovedAt?: Date | null;
}

/** "pending" sampai SEMUA approval yang diwajibkan laporan ini terisi. */
export function hitungStatusLaporan(r: ApprovalState): "pending" | "approved" {
  if (!r.approvedAt) return "pending";
  if (butuhApprovalSupervisiNext(r) && !r.supervisiNextApprovedAt) return "pending";
  return "approved";
}

export type LabelApproval =
  | "Menunggu Approval"
  | "Menunggu Supervisi Utama"
  | "Menunggu Supervisi Selanjutnya"
  | "Sudah Diapprove";

/** Label badge di menu Supervisi & halaman detail laporan. */
export function labelApproval(r: ApprovalState): LabelApproval {
  const utamaOk = Boolean(r.approvedAt);
  const nextOk = Boolean(r.supervisiNextApprovedAt);
  if (!butuhApprovalSupervisiNext(r)) {
    return utamaOk ? "Sudah Diapprove" : "Menunggu Approval";
  }
  if (utamaOk && nextOk) return "Sudah Diapprove";
  if (utamaOk) return "Menunggu Supervisi Selanjutnya";
  if (nextOk) return "Menunggu Supervisi Utama";
  return "Menunggu Approval";
}
