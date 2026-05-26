// Perhitungan SLA tiket gangguan (PRD §7).
//
//   TotalMenitBulan = 24 * 60 * jumlah_hari_dalam_bulan
//   LamaMenit       = WaktuSelesai - WaktuKejadian (dalam menit)
//   UptimeMenit     = TotalMenitBulan - LamaMenit
//   SLA%            = UptimeMenit / TotalMenitBulan
//
// Fungsi murni (tanpa I/O) — dipakai di server, client, & export Excel.

export interface SlaResult {
  selesai: boolean;
  totalMenitBulan: number;
  /** null bila tiket belum selesai. */
  lamaMenit: number | null;
  /** Lama penyelesaian format "hh:mm" (kolom O Excel). null bila belum selesai. */
  lamaHHMM: string | null;
  uptimeMenit: number | null;
  /** Pecahan 0..1 (kalikan 100 untuk persen). null bila belum selesai. */
  slaPersen: number | null;
}

/** Jumlah hari dalam bulan dari sebuah tanggal (mis. Mei = 31). */
export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function totalMenitBulan(date: Date): number {
  return 24 * 60 * daysInMonth(date);
}

/** Format menit → "hh:mm" (jam bisa > 24 bila gangguan lintas hari). */
export function menitToHHMM(menit: number): string {
  const hh = Math.floor(menit / 60);
  const mm = menit % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Format pecahan SLA → persen 2 desimal, mis. 0.9986 → "99.86%". */
export function formatSlaPersen(frac: number): string {
  return `${(frac * 100).toFixed(2)}%`;
}

/**
 * Hitung SLA satu episode gangguan.
 * `waktuKejadian` = waktu open tiket (kolom C). `waktuSelesai` null → "Dalam Proses".
 */
export function computeSla(
  waktuKejadian: Date,
  waktuSelesai: Date | null
): SlaResult {
  const total = totalMenitBulan(waktuKejadian);

  if (!waktuSelesai) {
    return {
      selesai: false,
      totalMenitBulan: total,
      lamaMenit: null,
      lamaHHMM: null,
      uptimeMenit: null,
      slaPersen: null,
    };
  }

  const diffMs = waktuSelesai.getTime() - waktuKejadian.getTime();
  const lamaMenit = Math.max(0, Math.round(diffMs / 60000));
  const uptimeMenit = total - lamaMenit;

  return {
    selesai: true,
    totalMenitBulan: total,
    lamaMenit,
    lamaHHMM: menitToHHMM(lamaMenit),
    uptimeMenit,
    slaPersen: uptimeMenit / total,
  };
}
