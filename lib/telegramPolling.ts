/**
 * Integrasi Telegram — Fase 3: handler perintah bot via polling.
 *
 * Lab Proxmox tidak punya domain publik untuk webhook, jadi bot menarik update
 * sendiri lewat getUpdates (offset-based polling). Saat supervisi mengirim
 * `/start` atau `/id`, bot membalas dengan chat_id-nya agar bisa diserahkan ke
 * Super Admin untuk diaktifkan di Manajemen Akun (Fase 2). Pengiriman pesan
 * tetap memakai {@link sendTelegramMessage} dari modul `telegram.ts`.
 *
 * Service ini dimulai otomatis saat server boot lewat `instrumentation.ts`
 * (register()), sehingga ikut hidup pada `npm run dev`, `next start`, maupun
 * docker up — tanpa proses/worker terpisah.
 */
import { sendTelegramMessage } from "./telegram";

/** Bentuk minimal objek update dari Telegram getUpdates. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: { id: number | string };
    text?: string;
  };
}

/** Perintah yang memicu balasan chat_id. */
const COMMANDS = new Set(["/start", "/id"]);

/** Jeda antar-polling (ms). Bisa di-override via env untuk pengujian/tuning. */
const POLL_INTERVAL_MS = Number(process.env.TELEGRAM_POLL_INTERVAL_MS) || 5000;

/**
 * True bila teks pesan adalah perintah yang harus dibalas chat_id.
 * Toleran terhadap spasi, huruf besar, dan suffix `@NamaBot`
 * (mis. `/id@mtrReportBot`).
 */
export function isChatIdCommand(text: string | null | undefined): boolean {
  if (!text) return false;
  const cmd = text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  return COMMANDS.has(cmd);
}

/** Pesan balasan berisi chat_id untuk diserahkan ke Super Admin. */
export function buildChatIdReply(chatId: string | number): string {
  return (
    `Chat ID Anda: <code>${chatId}</code>\n\n` +
    `Berikan Chat ID ini ke Super Admin mtr-Report untuk diaktifkan.`
  );
}

/**
 * Ambil update terbaru sejak `offset` dari Telegram getUpdates.
 * Tidak melempar error: kegagalan jaringan / respons tak terduga → array kosong.
 */
export async function fetchTelegramUpdates(
  token: string,
  offset: number
): Promise<TelegramUpdate[]> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`
    );
    const data = await res.json();
    return Array.isArray(data?.result) ? (data.result as TelegramUpdate[]) : [];
  } catch {
    return [];
  }
}

/**
 * Proses sekumpulan update: balas perintah `/start` & `/id` dengan chat_id,
 * lalu kembalikan offset berikutnya (update_id tertinggi + 1) untuk meng-ack
 * update yang sudah ditarik. Tidak melempar error.
 */
export async function processTelegramUpdates(
  updates: TelegramUpdate[],
  offset: number
): Promise<number> {
  let next = offset;
  for (const update of updates) {
    if (typeof update.update_id === "number") {
      next = Math.max(next, update.update_id + 1);
    }
    const chatId = update.message?.chat?.id;
    if (chatId != null && isChatIdCommand(update.message?.text)) {
      await sendTelegramMessage(chatId, buildChatIdReply(chatId));
    }
  }
  return next;
}

let started = false;

/**
 * Mulai service polling latar belakang. Idempotent (aman terhadap pemanggilan
 * ganda dari HMR/register). Dilewati bila `TELEGRAM_BOT_TOKEN` belum diset agar
 * tidak menembak getUpdates tanpa token.
 */
export function startTelegramPolling(): void {
  if (started) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN belum diset — polling bot dilewati."
    );
    return;
  }
  started = true;

  let offset = 0;
  let busy = false; // cegah tumpang tindih bila satu putaran lambat

  console.log(`[telegram] Polling bot aktif (tiap ${POLL_INTERVAL_MS} ms).`);
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const updates = await fetchTelegramUpdates(token, offset);
      offset = await processTelegramUpdates(updates, offset);
    } catch (err) {
      console.error("[telegram] Gagal polling:", err);
    } finally {
      busy = false;
    }
  }, POLL_INTERVAL_MS);

  // Timer ini tidak boleh menahan proses tetap hidup sendirian.
  if (typeof timer.unref === "function") timer.unref();
}
