"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fmtDateKey, fmtTime } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboardQueries";
import { MetricCards } from "./MetricCards";
import { ShiftIndicator } from "./ShiftIndicator";
import { MiniCalendar } from "./MiniCalendar";
import { DayTicketList } from "./DayTicketList";
import { AlertDock } from "./AlertDock";

/** Auto-refresh status open tiap 1 jam (PRD §4.A / §8). */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface Props {
  initialData: DashboardData;
  currentShift?: string;
}

export function DashboardClient({ initialData, currentShift }: Props) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const markedDates = useMemo(
    () => new Set(data.openTickets.map((t) => fmtDateKey(t.waktuOpen))),
    [data.openTickets]
  );

  const dayTickets = useMemo(
    () =>
      selected
        ? data.openTickets.filter((t) => fmtDateKey(t.waktuOpen) === selected)
        : [],
    [selected, data.openTickets]
  );

  return (
    <div className="space-y-5">
      {/* Toolbar refresh */}
      <div className="flex items-center justify-end gap-3 text-sm">
        <span className="text-gray-400">
          Diperbarui {fmtTime(data.generatedAt)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={refresh}
          loading={loading}
        >
          {!loading && <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <MetricCards atm={data.counts.atm} jaringan={data.counts.jaringan} />

      <Card padding="lg">
        <CardTitle className="mb-4">Tiket Open per Shift</CardTitle>
        <ShiftIndicator perShift={data.perShift} currentShift={currentShift} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="lg">
          <CardTitle className="mb-4">Kalender Tiket Berjalan</CardTitle>
          <MiniCalendar
            markedDates={markedDates}
            selected={selected}
            onSelect={setSelected}
          />
        </Card>
        <Card padding="lg">
          <CardTitle className="mb-4">Tiket pada Tanggal Terpilih</CardTitle>
          <DayTicketList dateKey={selected} tickets={dayTickets} />
        </Card>
      </div>

      <AlertDock openTickets={data.openTickets} />
    </div>
  );
}
