/**
 * Integrasi Telegram — Fase 4: lapisan DB + scheduler untuk notif approval.
 *
 * Memakai helper murni dari `telegramNotif.ts` dan menghubungkannya ke Prisma:
 * - {@link notifyReportPending}: notif langsung saat laporan shift dibuat.
 * - {@link startNotifScheduler}: pengingat berulang tiap awal jam.
 *
 * Scheduler memakai `setInterval` (selaras pola polling Fase 3 di
 * `telegramPolling.ts`) dan dimulai dari `instrumentation.ts` — tanpa worker
 * atau dependency cron terpisah. Gating jadwal ada di `sendPendingReminders`.
 */
import { prisma } from "./prisma";
import {
  bolehKirimNotif,
  sendPendingReminders,
  sendReportReminder,
  type PendingReportNotif,
} from "./telegramNotif";

/** Ambil semua laporan shift pending + relasi supervisi & owner untuk notif. */
export async function fetchPendingReports(): Promise<PendingReportNotif[]> {
  return prisma.shiftReport.findMany({
    where: { status: "pending" },
    include: { supervisi: true, ownerUser: true },
  });
}

/**
 * Notif LANGSUNG saat sebuah laporan shift baru dibuat (serah terima / tutup
 * laporan). Hanya dikirim bila dalam jadwal (Sen–Jum 07:00–18:00 WIB); di luar
 * jadwal, scheduler berkala yang akan mengirim saat masuk jadwal. Tidak melempar
 * error agar tidak mengganggu respons serah terima.
 */
export async function notifyReportPending(reportId: string): Promise<void> {
  if (!bolehKirimNotif()) return;
  try {
    const report = await prisma.shiftReport.findUnique({
      where: { id: reportId },
      include: { supervisi: true, ownerUser: true },
    });
    if (report) await sendReportReminder(report);
  } catch (err) {
    console.error("[telegram] Gagal kirim notif laporan baru:", err);
  }
}

/** Satu putaran pengingat untuk semua laporan pending (dipakai scheduler). */
export async function runPendingReminders(): Promise<number> {
  const reports = await fetchPendingReports();
  return sendPendingReminders(reports);
}

let started = false;

/**
 * Mulai scheduler pengingat approval. Idempotent (aman dipanggil ganda dari
 * HMR/register). Dilewati bila `TELEGRAM_BOT_TOKEN` belum diset. Tick pertama
 * diselaraskan ke awal jam berikutnya, lalu berulang tiap 1 jam; pengiriman
 * tetap di-gate jadwal (Sen–Jum 07:00–18:00 WIB) di `sendPendingReminders`.
 */
export function startNotifScheduler(): void {
  if (started) return;
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN belum diset — scheduler reminder dilewati."
    );
    return;
  }
  started = true;

  const tick = async () => {
    try {
      const n = await runPendingReminders();
      if (n > 0) console.log(`[telegram] ${n} pengingat approval terkirim.`);
    } catch (err) {
      console.error("[telegram] Gagal menjalankan pengingat approval:", err);
    }
  };

  // Selaraskan tick pertama ke awal jam berikutnya, lalu ulang tiap 1 jam.
  // Offset WIB kelipatan jam penuh → awal jam lokal = awal jam WIB.
  const now = new Date();
  const msToNextHour =
    (60 - now.getMinutes()) * 60_000 -
    now.getSeconds() * 1000 -
    now.getMilliseconds();

  const startTimer = setTimeout(() => {
    void tick();
    const hourly = setInterval(() => void tick(), 60 * 60 * 1000);
    if (typeof hourly.unref === "function") hourly.unref();
  }, msToNextHour);
  if (typeof startTimer.unref === "function") startTimer.unref();

  console.log(
    "[telegram] Scheduler pengingat approval aktif (tiap awal jam, Sen–Jum 07:00–18:00 WIB)."
  );
}
