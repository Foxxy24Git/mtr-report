import type { Role } from "@/lib/roles";

/** Prefix route yang dibatasi role tertentu (PRD §2). */
const RESTRICTED: { prefix: string; roles: Role[] }[] = [
  // Super Admin tidak open/track tiket gangguan (PRD §2) — hanya petugas.
  // Supervisi tidak boleh akses halaman User (PRD revisi §5).
  { prefix: "/daily-monitoring", roles: ["user"] },
  { prefix: "/open-tiket", roles: ["user"] },
  { prefix: "/data-atm", roles: ["superadmin", "user"] },
  { prefix: "/suhu-server", roles: ["user"] },
  { prefix: "/supervisi", roles: ["supervisi"] },
  // Menu Leader: kelola pimpinan — hanya Super Admin (PRD §4.G).
  { prefix: "/leader", roles: ["superadmin"] },
  // Manajemen Akun — hanya Super Admin (PRD §3).
  { prefix: "/manajemen-akun", roles: ["superadmin"] },
  // Database Studio + API-nya — hanya Super Admin (PRD §3).
  { prefix: "/database-studio", roles: ["superadmin"] },
  { prefix: "/api/superadmin", roles: ["superadmin"] },
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
