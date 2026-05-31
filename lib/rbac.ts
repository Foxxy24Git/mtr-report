import type { Role } from "@/lib/roles";

/** Prefix route yang dibatasi role tertentu (PRD §2). */
const RESTRICTED: { prefix: string; roles: Role[] }[] = [
  // Supervisi tidak boleh akses halaman User (PRD revisi §5).
  { prefix: "/daily-monitoring", roles: ["superadmin", "user"] },
  { prefix: "/open-tiket", roles: ["superadmin", "user"] },
  { prefix: "/data-atm", roles: ["superadmin", "user"] },
  { prefix: "/suhu-server", roles: ["superadmin", "user"] },
  { prefix: "/supervisi", roles: ["superadmin", "supervisi"] },
];

/**
 * True jika role boleh mengakses pathname.
 * Default: semua user yang sudah login boleh (hanya RESTRICTED yang dibatasi).
 */
export function canAccess(role: Role, pathname: string): boolean {
  for (const r of RESTRICTED) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) {
      return r.roles.includes(role);
    }
  }
  return true;
}
