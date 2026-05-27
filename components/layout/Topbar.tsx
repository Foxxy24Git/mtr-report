"use client";

import { cn } from "@/lib/cn";
import { SHIFT_LABELS, type Role } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Bell, ChevronDown, LogOut, User2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Admin",
  user: "Petugas Monitoring",
  supervisi: "Supervisi",
};

export interface SessionUser {
  nama: string;
  username: string;
  role: Role;
  shift: string;
  fotoProfilUrl?: string | null;
}

export function Topbar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-20 flex items-center justify-between",
        "px-6 bg-white border-b border-gray-200 shadow-sm"
      )}
      style={{
        left: "var(--sidebar-width)",
        height: "var(--topbar-height)",
      }}
    >
      {/* Kiri: judul sistem */}
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium">Sistem Monitoring</p>
          <p className="text-sm font-semibold text-gray-900">
            ATM &amp; Jaringan Bank Nagari
          </p>
        </div>
      </div>

      {/* Kanan: shift + notif + profil */}
      <div className="flex items-center gap-3">
        {SHIFT_LABELS[user.shift] ? (
          <Badge variant="primary" className="text-xs font-semibold">
            {SHIFT_LABELS[user.shift]}
          </Badge>
        ) : (
          <a
            href="/dashboard"
            className="text-xs font-semibold rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2.5 py-1 hover:bg-amber-100 transition-colors"
          >
            Pilih shift
          </a>
        )}

        <button
          aria-label="Notifikasi"
          className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            aria-label="Menu akun"
            aria-expanded={dropdownOpen}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 overflow-hidden">
              {user.fotoProfilUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.fotoProfilUrl}
                  alt={user.nama}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User2 className="w-4 h-4 text-white" />
              )}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-800 leading-tight">
                {user.nama}
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                @{user.username}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-gray-400 transition-transform duration-200",
                dropdownOpen && "rotate-180"
              )}
            />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-card-lg border border-gray-100 z-20 overflow-hidden animate-slide-up">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-xs text-gray-400">Masuk sebagai</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {user.nama}
                  </p>
                  <Badge variant="neutral" className="mt-1">
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </div>
                <ul className="py-1">
                  <li>
                    <a
                      href="/setting"
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Profil &amp; Setting
                    </a>
                  </li>
                  <li>
                    <button
                      disabled={loggingOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4" />
                      {loggingOut ? "Keluar…" : "Keluar"}
                    </button>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
