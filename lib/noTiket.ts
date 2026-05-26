import type { PrismaClient } from "@prisma/client";

/** Charset no tiket: angka & huruf besar (alfanumerik uppercase). */
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Panjang bagian acak setelah prefix `BN-` (PRD §4.C: contoh BN-28A37163). */
export const NO_TIKET_RANDOM_LEN = 8;

export const NO_TIKET_PREFIX = "BN-";

/** Pola valid no tiket: `BN-` + 8 alfanumerik uppercase. */
export const NO_TIKET_REGEX = /^BN-[A-Z0-9]{8}$/;

/** Buat satu kandidat no tiket acak (belum dicek unik). */
export function generateNoTiketCandidate(): string {
  let s = "";
  for (let i = 0; i < NO_TIKET_RANDOM_LEN; i++) {
    s += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return NO_TIKET_PREFIX + s;
}

/**
 * Buat no tiket unik — coba beberapa kali sampai tidak bentrok di DB.
 * Throw bila gagal setelah `maxTries` percobaan (sangat tidak mungkin).
 */
export async function generateUniqueNoTiket(
  prisma: PrismaClient,
  maxTries = 10
): Promise<string> {
  for (let i = 0; i < maxTries; i++) {
    const candidate = generateNoTiketCandidate();
    const existing = await prisma.ticket.findUnique({
      where: { noTiket: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Gagal membuat no tiket unik setelah beberapa percobaan.");
}
