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
import { butuhApprovalSupervisiNext } from "./shiftReportApproval";

const TZ = "Asia/Jakarta";
const WEEKEND = new Set(["Sat", "Sun"]);

/** Satu tiket lanjutan yang ditampilkan di notif supervisi selanjutnya. */
export interface TiketLanjutanNotif {
  noTiket: string;
  kodeAtm: string;
  namaAtm: string;
}

/** Data minimal sebuah laporan shift yang dibutuhkan untuk menyusun notif. */
export interface PendingReportNotif {
  shiftLabel: string;
  /** Kode shift — penentu apakah supervisi selanjutnya ikut dinotifikasi. */
  shiftKode?: string;
  tanggal: Date | string;
  ownerUser?: { nama?: string | null } | null;
  supervisi?: { nama?: string | null; telegramChatId?: string | null } | null;
  supervisiNext?: { nama?: string | null; telegramChatId?: string | null } | null;
  supervisiId?: string | null;
  supervisiNextId?: string | null;
  approvedAt?: Date | null;
  supervisiNextApprovedAt?: Date | null;
  tiketLanjutan?: TiketLanjutanNotif[];
}

/** Batas tiket yang dirinci di pesan — sisanya diringkas (limit Telegram 4096 char). */
const MAX_TIKET_NOTIF = 10;

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
 * Pesan pengingat approval untuk SUPERVISI SELANJUTNYA (shift malam C/E).
 *
 * Berbeda dari pesan supervisi utama: memuat daftar tiket yang diteruskan ke
 * shift berikutnya, karena justru itulah yang perlu ia ketahui sebelum approve.
 */
export function buildSupervisiNextMessage(report: PendingReportNotif): string {
  const nama = report.supervisiNext?.nama ?? "Supervisi";
  const petugas = report.ownerUser?.nama ?? "-";
  const tiket = report.tiketLanjutan ?? [];
  const tampil = tiket.slice(0, MAX_TIKET_NOTIF);
  const sisa = tiket.length - tampil.length;
  const daftar =
    tiket.length === 0
      ? "🔁 Tidak ada tiket lanjutan pada shift ini."
      : `🔁 <b>Tiket lanjutan yang menjadi pemantauan Anda (${tiket.length}):</b>\n` +
        tampil.map((t) => `• ${t.noTiket} — ${t.kodeAtm} ${t.namaAtm}`).join("\n") +
        (sisa > 0 ? `\n• … dan ${sisa} tiket lainnya` : "");
  return (
    `🌙 <b>Approval Supervisi Selanjutnya — mtr-Report</b>\n\n` +
    `Halo ${nama}, laporan shift malam berikut menunggu persetujuan Anda:\n\n` +
    `📋 ${report.shiftLabel}\n` +
    `📅 ${fmtDate(report.tanggal)}\n` +
    `👤 Petugas: ${petugas}\n\n` +
    `${daftar}\n\n` +
    `Mohon approve di aplikasi agar laporan lengkap & TTD Anda terpasang.\n` +
    `<i>(Pengingat berulang tiap 1 jam, Senin–Jumat 07:00–18:00, sampai Anda approve)</i>`
  );
}

/**
 * Kirim pengingat ke SEMUA peran laporan yang belum approve. Mengembalikan
 * jumlah pesan terkirim (0 bila tidak ada tujuan / semua sudah approve).
 * Tidak melempar error.
 */
export async function sendReportReminder(
  report: PendingReportNotif
): Promise<number> {
  const butuhNext = butuhApprovalSupervisiNext({
    shiftKode: report.shiftKode ?? "",
    supervisiNextId: report.supervisiNextId ?? null,
  });

  // Dedupe per chatId: bila orang yang sama memegang dua peran (supervisi utama
  // == supervisi selanjutnya, lihat lembar manual 01-08-2026 19-07) ia hanya
  // menerima SATU pesan. Pesan supervisi selanjutnya menang karena isinya
  // superset — memuat daftar tiket lanjutan.
  const tujuan = new Map<string, string>();
  if (!report.approvedAt && report.supervisi?.telegramChatId) {
    tujuan.set(report.supervisi.telegramChatId, buildReminderMessage(report));
  }
  if (
    butuhNext &&
    !report.supervisiNextApprovedAt &&
    report.supervisiNext?.telegramChatId
  ) {
    tujuan.set(
      report.supervisiNext.telegramChatId,
      buildSupervisiNextMessage(report)
    );
  }

  let sent = 0;
  for (const [chatId, text] of tujuan) {
    const res = await sendTelegramMessage(chatId, text);
    if (res.ok) sent++;
  }
  return sent;
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
    sent += await sendReportReminder(report);
  }
  return sent;
}
