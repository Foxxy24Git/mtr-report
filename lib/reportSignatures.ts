/** Referensi penanda tangan: nama + path TTD digital (relatif /public). */
export interface SignerRef {
  nama?: string | null;
  ttdUrl?: string | null;
}

/**
 * Tentukan "Petugas Monitoring yang menyerahkan" (kolom C26) — PRD §5, PART 3.
 *
 * Sumber utama: owner tiket PERTAMA pada shift (owner awal shift). TTD-nya
 * SELALU ikut tampil, walau laporan di-download sebelum serah terima shift.
 * Fallback: petugas penyerah dari record handover; lalu nama gabungan owner.
 *
 * TTD diambil ketat dari pemegang nama yang dipilih — tidak meminjam TTD
 * orang lain agar nama & tanda tangan selalu konsisten.
 */
export function resolveSender(
  firstOwner: SignerRef | null | undefined,
  handoverFromUser: SignerRef | null | undefined,
  fallbackNama: string
): { nama: string; ttdPath: string | null } {
  if (firstOwner?.nama) {
    return { nama: firstOwner.nama, ttdPath: firstOwner.ttdUrl ?? null };
  }
  if (handoverFromUser?.nama) {
    return { nama: handoverFromUser.nama, ttdPath: handoverFromUser.ttdUrl ?? null };
  }
  return { nama: fallbackNama, ttdPath: null };
}

/**
 * Tentukan "Mengetahui" (O26 infra / R26 divisi) — PRD §5, PART 4.
 *
 * Pimpinan dipilih saat serah terima shift. Sumber: nama pilihan handover →
 * fallback pimpinan tingkat tiket. TANPA default pimpinan aktif: bila laporan
 * diunduh sebelum serah terima, kolom dibiarkan KOSONG (keputusan PART 4).
 */
export function resolveAcknowledger(
  handoverNama: string | null | undefined,
  ticketNama: string | null | undefined
): string {
  return (handoverNama ?? "").trim() || (ticketNama ?? "").trim() || "";
}
