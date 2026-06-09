/**
 * Integrasi Telegram — Fase 4: notif approval laporan shift.
 *
 * Helper murni (tanpa akses DB) untuk:
 * - menentukan apakah saat ini boleh mengirim notif (jadwal WIB Senin–Jumat,
 *   07:00–18:00),
 * - menyusun pesan pengingat approval,
 * - mengirim pengingat ke supervisi terpilih sebuah laporan.
 *
 * Bagian yang menyentuh database (query laporan pending + scheduler berkala)
 * ada di `telegramScheduler.ts` agar modul ini tetap mudah diuji unit.
 */
import { sendTelegramMessage } from "./telegram";
import { fmtDate } from "./format";

const TZ = "Asia/Jakarta";
const WEEKEND = new Set(["Sat", "Sun"]);

/** Data minimal sebuah laporan shift yang dibutuhkan untuk menyusun notif. */
export interface PendingReportNotif {
  shiftLabel: string;
  tanggal: Date | string;
  ownerUser?: { nama?: string | null } | null;
  supervisi?: { nama?: string | null; telegramChatId?: string | null } | null;
}

/**
 * True bila `now` berada dalam jadwal notif: Senin–Jumat, jam 07:00–18:00 WIB.
 *
 * Memakai jam dinding WIB (Asia/Jakarta) — bukan jam lokal server — agar tetap
 * benar walau kontainer berjalan di UTC (selaras konvensi WIB seluruh aplikasi).
 */
export function bolehKirimNotif(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const hariKerja = !WEEKEND.has(weekday); // Senin–Jumat
  const jamKerja = hour >= 7 && hour < 18; // 07:00–18:00
  return hariKerja && jamKerja;
}

/** Pesan pengingat approval (HTML) untuk supervisi sebuah laporan shift. */
export function buildReminderMessage(report: PendingReportNotif): string {
  const nama = report.supervisi?.nama ?? "Supervisi";
  const petugas = report.ownerUser?.nama ?? "-";
  return (
    `🔔 <b>Pengingat Approval — mtr-Report</b>\n\n` +
    `Halo ${nama}, ada laporan shift menunggu persetujuan Anda:\n\n` +
    `📋 ${report.shiftLabel}\n` +
    `📅 ${fmtDate(report.tanggal)}\n` +
    `👤 Petugas: ${petugas}\n\n` +
    `Mohon segera approve di aplikasi.\n` +
    `<i>(Pengingat berulang tiap 1 jam, Senin–Jumat 07:00–18:00, sampai Anda approve)</i>`
  );
}

/**
 * Kirim 1 pengingat ke supervisi terpilih laporan. Dilewati (return false) bila
 * supervisi belum punya `telegramChatId`. Tidak melempar error.
 */
export async function sendReportReminder(
  report: PendingReportNotif
): Promise<boolean> {
  const chatId = report.supervisi?.telegramChatId;
  if (!chatId) return false;
  const res = await sendTelegramMessage(chatId, buildReminderMessage(report));
  return res.ok;
}

/**
 * Kirim pengingat untuk sekumpulan laporan pending — HANYA bila dalam jadwal
 * (lihat {@link bolehKirimNotif}). Mengembalikan jumlah pesan yang terkirim.
 * Di luar jadwal: tidak mengirim apa pun (return 0).
 */
export async function sendPendingReminders(
  reports: PendingReportNotif[],
  now: Date = new Date()
): Promise<number> {
  if (!bolehKirimNotif(now)) return 0;
  let sent = 0;
  for (const report of reports) {
    if (await sendReportReminder(report)) sent++;
  }
  return sent;
}
