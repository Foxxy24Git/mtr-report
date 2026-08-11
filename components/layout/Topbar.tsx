"use client";

import { cn } from "@/lib/cn";
import { SHIFT_LABELS, type Role } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Bell, ChevronDown, LogOut, User2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface NotificationItem {
  id: string;
  ticketId: string;
  noTiket: string;
  message: string;
  createdAt: string;
}

const NOTIF_POLL_MS = 20_000;

/** Tujuan klik notifikasi: satu-satunya halaman detail tiket per-item per role. */
function ticketDetailPath(role: Role, ticketId: string): string {
  return role === "supervisi"
    ? `/weekly-monitoring/${ticketId}`
    : `/daily-monitoring/${ticketId}`;
}

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
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifItems, setNotifItems] = useState<NotificationItem[] | null>(null);
  const [loadingNotif, setLoadingNotif] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  useEffect(() => {
    let cancelled = false;
    async function pollCount() {
      try {
        const res = await fetch("/api/notifications/count");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setUnreadCount(data.count ?? 0);
      } catch {
        // Abaikan kegagalan polling — dicoba lagi di interval berikutnya.
      }
    }
    pollCount();
    const t = setInterval(pollCount, NOTIF_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function toggleNotif() {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (!opening) return;
    setLoadingNotif(true);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifItems(res.ok ? data.items : []);
      // GET /api/notifications menandai sudah dibaca di server — badge reset.
      setUnreadCount(0);
    } catch {
      setNotifItems([]);
    } finally {
      setLoadingNotif(false);
    }
  }

  function goToTicket(ticketId: string) {
    setNotifOpen(false);
    router.push(ticketDetailPath(user.role, ticketId));
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

        <div className="relative">
          <button
            onClick={toggleNotif}
            aria-label="Notifikasi"
            aria-expanded={notifOpen}
            className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none border-2 border-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setNotifOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-xl shadow-card-lg border border-gray-100 z-20 overflow-hidden animate-slide-up">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">
                    Notifikasi
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {loadingNotif ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      Memuat…
                    </p>
                  ) : !notifItems || notifItems.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      Tidak ada notifikasi.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {notifItems.map((n) => (
                        <li key={n.id}>
                          <button
                            onClick={() => goToTicket(n.ticketId)}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <p className="text-xs font-semibold text-primary">
                              {n.noTiket}
                            </p>
                            <p className="text-sm text-gray-700 leading-snug mt-0.5">
                              {n.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(n.createdAt).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

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
