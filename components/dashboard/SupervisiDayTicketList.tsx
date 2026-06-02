"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/format";
import { SHIFT_NAMES } from "@/lib/constants";
import type { SupervisiPendingShiftReport } from "@/lib/dashboardQueries";

interface Props {
  dateKey: string | null;
  reports: SupervisiPendingShiftReport[];
}

/**
 * Daftar laporan shift belum approve pada tanggal terpilih (Dashboard
 * Supervisi). Klik → halaman tinjau laporan shift /supervisi/[id].
 */
export function SupervisiDayTicketList({ dateKey, reports }: Props) {
  const router = useRouter();

  if (!dateKey) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400">
        <CalendarDays className="w-8 h-8 mb-2" />
        <p className="text-sm">
          Pilih tanggal pada kalender untuk melihat laporan shift.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {fmtDate(dateKey)} · {reports.length} laporan belum approve
      </p>
      {reports.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Tidak ada laporan shift belum approve pada tanggal ini.
        </p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
          {reports.map((r, i) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <button
                onClick={() => router.push(`/supervisi/${r.id}`)}
                className="w-full text-left rounded-lg border border-gray-100 bg-surface-muted hover:bg-surface-subtle px-3 py-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {SHIFT_NAMES[r.shiftKode] ?? `Shift ${r.shiftKode}`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {r.jmlTiket} tiket
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <Badge variant="warning">Menunggu Approval</Badge>
                  <Badge variant="neutral">Petugas: {r.ownerNama}</Badge>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
