"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fmtDateKey, fmtTime } from "@/lib/format";
import type { SupervisiDashboardData } from "@/lib/dashboardQueries";
import { SupervisiMetricCards } from "./SupervisiMetricCards";
import { MiniCalendar } from "./MiniCalendar";
import { SupervisiDayTicketList } from "./SupervisiDayTicketList";

/** Auto-refresh status tiket tertunda tiap 1 jam (selaras Dashboard User). */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface Props {
  initialData: SupervisiDashboardData;
}

export function SupervisiDashboardClient({ initialData }: Props) {
  const [data, setData] = useState<SupervisiDashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/supervisi", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Tandai tanggal yang punya tiket belum approve (PRD revisi §4.A).
  const markedDates = useMemo(
    () => new Set(data.pendingTickets.map((t) => fmtDateKey(t.waktuOpen))),
    [data.pendingTickets]
  );

  const dayTickets = useMemo(
    () =>
      selected
        ? data.pendingTickets.filter((t) => fmtDateKey(t.waktuOpen) === selected)
        : [],
    [selected, data.pendingTickets]
  );

  return (
    <div className="space-y-5">
      {/* Toolbar refresh — tanpa selector shift (PRD revisi §4.A). */}
      <div className="flex items-center justify-end gap-3 text-sm">
        <span className="text-gray-400">Diperbarui {fmtTime(data.generatedAt)}</span>
        <Button variant="secondary" size="sm" onClick={refresh} loading={loading}>
          {!loading && <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <SupervisiMetricCards pending={data.pending} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="lg">
          <CardTitle className="mb-4">Kalender Tiket Belum Approve</CardTitle>
          <MiniCalendar
            markedDates={markedDates}
            selected={selected}
            onSelect={setSelected}
          />
        </Card>
        <Card padding="lg">
          <CardTitle className="mb-4">Tiket Belum Approve pada Tanggal Terpilih</CardTitle>
          <SupervisiDayTicketList dateKey={selected} tickets={dayTickets} />
        </Card>
      </div>
    </div>
  );
}
