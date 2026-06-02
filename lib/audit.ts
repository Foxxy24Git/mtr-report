import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Jejak audit Database Studio. Setiap edit/hapus baris dicatat ke tabel
 * audit_logs (lihat model AuditLog). before/after dinormalisasi ke JSON murni
 * (Date → string ISO) agar valid sebagai kolom Json Prisma.
 */
export type AuditAction = "update" | "delete";

export interface AuditEntry {
  userId: string;
  username: string;
  action: AuditAction;
  tableName: string;
  rowId: string;
  before?: unknown;
  after?: unknown;
}

/** Ubah objek apa pun jadi JSON murni (buang Date, undefined, dll.). */
export function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      username: entry.username,
      action: entry.action,
      tableName: entry.tableName,
      rowId: entry.rowId,
      before: toJsonValue(entry.before),
      after: toJsonValue(entry.after),
    },
  });
}
