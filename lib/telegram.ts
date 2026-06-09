/**
 * Integrasi Telegram — Fase 1: fungsi kirim pesan.
 *
 * Token bot diambil dari env `TELEGRAM_BOT_TOKEN` (didapat dari @BotFather).
 * Tidak melempar error: selalu mengembalikan {@link TelegramResult} agar caller
 * (mis. endpoint test) cukup memeriksa `ok`.
 */

export interface TelegramResult {
  ok: boolean;
  /** Alasan gagal singkat (token/chatId kosong atau pesan error jaringan). */
  reason?: string;
  /** Respons mentah dari Telegram API saat permintaan terkirim. */
  data?: unknown;
}

/**
 * Kirim pesan teks ke sebuah chat via Telegram Bot API (parse_mode HTML).
 *
 * @param chatId  ID chat tujuan (numerik atau string). Kosong → tidak dikirim.
 * @param message Isi pesan (boleh mengandung tag HTML sederhana Telegram).
 */
export async function sendTelegramMessage(
  chatId: string | number | null | undefined,
  message: string
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    return { ok: false, reason: "token/chatId kosong" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );
    const data = await res.json();
    return { ok: data.ok, data };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
