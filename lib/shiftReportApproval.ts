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

/** Peran yang sudah pasti terkait laporan (hasil resolvePeranApproval bukan null). */
export type PeranApprovalAktif = Exclude<PeranApproval, null>;

/**
 * True bila request approve ini harus ditolak sebagai konflik (409): semua
 * kolom approval yang jadi tanggung jawab peran ini (utama/selanjutnya/
 * keduanya) sudah terisi lebih dulu, jadi tidak ada apa pun lagi yang perlu
 * ditulis untuk user tersebut.
 */
export function cekKonflikApproval(
  peran: PeranApprovalAktif,
  fresh: ApprovalState
): boolean {
  const perluUtama = peran === "utama" || peran === "keduanya";
  const perluNext = peran === "selanjutnya" || peran === "keduanya";
  const utamaSudah = fresh.approvedAt != null;
  const nextSudah = fresh.supervisiNextApprovedAt != null;
  return (!perluUtama || utamaSudah) && (!perluNext || nextSudah);
}

/** Kolom yang ditulis ke shift_reports oleh satu aksi approve. */
export interface PatchApprovalLaporan {
  status: "pending" | "approved";
  approvedAt?: Date;
  approvedById?: string;
  catatanSupervisi?: string | null;
  supervisiNextApprovedAt?: Date;
  supervisiNextApprovedById?: string;
  catatanSupervisiNext?: string | null;
}

/**
 * Menyusun patch approval untuk satu klik approve: isi kolom utama, kolom
 * selanjutnya, atau keduanya sekaligus (peran "keduanya") sesuai kolom mana
 * yang belum terisi di `fresh`, lalu tentukan status akhir laporan dari nilai
 * BARU tersebut supaya approve terakhir langsung menutup laporan.
 */
export function susunPatchApproval(
  peran: PeranApprovalAktif,
  fresh: ApprovalState,
  userId: string,
  catatan: string | null,
  now: Date
): PatchApprovalLaporan {
  const perluUtama = peran === "utama" || peran === "keduanya";
  const perluNext = peran === "selanjutnya" || peran === "keduanya";
  const utamaSudah = fresh.approvedAt != null;
  const nextSudah = fresh.supervisiNextApprovedAt != null;

  const patch: PatchApprovalLaporan = { status: "pending" };
  if (perluUtama && !utamaSudah) {
    patch.approvedAt = now;
    patch.approvedById = userId;
    patch.catatanSupervisi = catatan;
  }
  if (perluNext && !nextSudah) {
    patch.supervisiNextApprovedAt = now;
    patch.supervisiNextApprovedById = userId;
    patch.catatanSupervisiNext = catatan;
  }

  patch.status = hitungStatusLaporan({
    shiftKode: fresh.shiftKode,
    supervisiNextId: fresh.supervisiNextId,
    approvedAt: patch.approvedAt ?? fresh.approvedAt,
    supervisiNextApprovedAt:
      patch.supervisiNextApprovedAt ?? fresh.supervisiNextApprovedAt,
  });

  return patch;
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
