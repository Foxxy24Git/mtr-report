/**
 * Hook startup Next.js (dipanggil sekali saat server boot: `next dev`,
 * `next start`, maupun standalone/docker). Dipakai untuk memulai service latar
 * belakang Telegram tanpa worker terpisah:
 * - polling bot untuk perintah `/start` & `/id` (Fase 3),
 * - scheduler pengingat approval laporan shift tiap jam (Fase 4).
 *
 * Hanya dijalankan pada runtime Node.js (bukan Edge), karena memakai `fetch`
 * jangka panjang + `setInterval`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramPolling } = await import("./lib/telegramPolling");
    startTelegramPolling();
    const { startNotifScheduler } = await import("./lib/telegramScheduler");
    startNotifScheduler();
  }
}
