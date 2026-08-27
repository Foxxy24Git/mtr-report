/**
 * Normalisasi nomor WhatsApp ke format siap-JID: hanya digit, kode negara 62
 * di depan (bukan 0 atau +62). Dipakai saat menyimpan `User.waNomor` supaya
 * format-nya konsisten untuk di-mention via WAHA (lib/n8nNotif.ts).
 */
export function normalizeWaNomor(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}
