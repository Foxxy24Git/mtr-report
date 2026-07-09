import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/roles";

export const COOKIE_NAME = "mtr_session";

/** Durasi sesi: 12 jam (mencakup shift terpanjang D/E). */
export const SESSION_MAX_AGE = 60 * 60 * 12;

export interface SessionPayload {
  sub: string; // user id
  username: string;
  nama: string;
  role: Role;
  /** Shift aktif. Kosong ("") bila petugas belum memilih shift di Dashboard. */
  shift: string;
  /**
   * Awal sesi shift (ISO 8601). Diisi saat user memilih shift, dikosongkan
   * saat login & saat serah terima shift. Dipakai Daily Monitoring untuk
   * membatasi tiket pada shift session yang sedang berjalan (PRD revisi §4.B).
   */
  shiftStartedAt: string;
}

/**
 * Flag `secure` untuk cookie sesi. Default true di production (asumsi HTTPS
 * di depan). Bisa dioverride via env COOKIE_SECURE="false"/"true" untuk
 * deployment yang diakses HTTP polos langsung (tanpa reverse proxy TLS),
 * karena browser menolak menyimpan cookie `Secure` di koneksi non-HTTPS.
 */
export function isSecureCookie(): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET tidak diset");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: String(payload.sub),
      username: String(payload.username),
      nama: String(payload.nama),
      role: payload.role as Role,
      shift: typeof payload.shift === "string" ? payload.shift : "",
      shiftStartedAt:
        typeof payload.shiftStartedAt === "string" ? payload.shiftStartedAt : "",
    };
  } catch {
    return null;
  }
}
