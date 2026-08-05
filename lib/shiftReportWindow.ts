/**
 * Jendela waktu untuk mencocokkan `TicketActivity` ke laporan shift yang
 * menaunginya.
 *
 * Modul MURNI: tanpa Prisma dan tanpa "server-only", supaya bisa diuji unit
 * tanpa database. Pola yang sama dengan lib/shiftReportApproval.ts.
 */

const ACTIVITY_MATCH_TOLERANCE_MS = 30 * 60 * 1000;

/**
 * Jendela toleransi di sekitar `tanggal` (waktu tutup laporan) untuk
 * mencocokkan aktivitas tindak lanjut ke laporan ini. `TicketActivity`
 * (isTindakLanjutFlag) dan `ShiftReport` dibuat dalam SATU transaksi Prisma
 * yang sama (lihat route handover & close) sehingga selisih waktunya cuma
 * hitungan milidetik — toleransi 30 menit di kedua sisi sudah sangat longgar,
 * sekaligus masih jauh lebih sempit dari jarak minimum antar kemunculan
 * `shiftKode` yang sama (≥16 jam), jadi tidak berisiko nyasar ke shift C/E
 * di hari lain.
 */
export function activityMatchWindow(tanggal: Date): { start: Date; end: Date } {
  return {
    start: new Date(tanggal.getTime() - ACTIVITY_MATCH_TOLERANCE_MS),
    end: new Date(tanggal.getTime() + ACTIVITY_MATCH_TOLERANCE_MS),
  };
}
