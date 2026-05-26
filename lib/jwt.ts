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
  shift: string;
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
      shift: String(payload.shift),
    };
  } catch {
    return null;
  }
}
