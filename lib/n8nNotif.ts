/**
 * Integrasi n8n — notifikasi WhatsApp grup kantor saat tiket baru dibuka.
 *
 * Webhook URL & secret diambil dari env `N8N_TICKET_WEBHOOK_URL` dan
 * `N8N_TICKET_WEBHOOK_SECRET`. Tidak melempar error: selalu mengembalikan
 * {@link N8nNotifResult} agar caller (app/api/tickets/route.ts) tidak perlu
 * try/catch, konsisten dengan pola sendTelegramMessage (lib/telegram.ts).
 */

export interface N8nNotifResult {
  ok: boolean;
  reason?: string;
}

export interface TicketOpenedPayload {
  noTiket: string;
  kategori: string;
  kodeAtm: string;
  namaAtm: string;
  jenisGangguan: string;
  sumberPenyebab: string;
  supervisiNama: string;
  /** Nomor WA supervisi (format 62xxxxxxxxxx), null kalau belum diset di Manajemen Akun. */
  supervisiWaNomor: string | null;
}

export async function notifyTicketOpened(
  payload: TicketOpenedPayload
): Promise<N8nNotifResult> {
  const url = process.env.N8N_TICKET_WEBHOOK_URL;
  const secret = process.env.N8N_TICKET_WEBHOOK_SECRET;
  if (!url || !secret) {
    return { ok: false, reason: "url/secret kosong" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
