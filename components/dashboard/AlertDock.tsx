"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X, AlertCircle, ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { fmtTime } from "@/lib/format";
import type { DashboardOpenTicket } from "@/lib/dashboardQueries";

interface Props {
  openTickets: DashboardOpenTicket[];
}

export function AlertDock({ openTickets }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = openTickets.length;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-80 max-w-[calc(100vw-2.5rem)] rounded-xl bg-white shadow-card-lg border border-gray-100 overflow-hidden"
          >
            <div className="flex items-center justify-between bg-primary px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  ATM &amp; Jaringan Open
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/15 transition-colors"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {count === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Tidak ada tiket open. Semua aman. 🎉
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto scrollbar-thin divide-y divide-gray-100">
                {openTickets.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => router.push(`/daily-monitoring/${t.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-muted transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {t.noTiket}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {fmtTime(t.waktuOpen)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600 truncate">
                        <span className="font-mono">{t.kodeAtm}</span> · {t.namaAtm}
                      </p>
                      <div className="mt-1 flex items-center gap-1">
                        <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                          {t.kategori === "atm" ? "ATM" : "Jaringan"}
                        </Badge>
                        {t.lanjutan && (
                          <Badge variant="warning">
                            <ArrowRightLeft className="w-3 h-3 mr-0.5" /> Lanjutan
                          </Badge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid place-items-center w-14 h-14 rounded-full bg-primary text-white shadow-card-lg hover:bg-primary-dark transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={`${count} tiket open`}
      >
        <Bell className="w-6 h-6" />
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 grid place-items-center rounded-full bg-accent text-nagari-navy text-xs font-bold border-2 border-white"
          >
            {count}
          </motion.span>
        )}
      </button>
    </div>
  );
}
