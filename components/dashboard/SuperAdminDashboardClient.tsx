"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CalendarDays, Ticket as TicketIcon } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { fmtDateKey, fmtTime, fmtDate, fmtDateTime } from "@/lib/format";
import type { Role } from "@/lib/roles";
import type {
  SuperAdminDashboardData,
  SuperAdminOpenTicket,
} from "@/lib/dashboardQueries";
import { SuperAdminMetricCards } from "./SuperAdminMetricCards";
import { MiniCalendar } from "./MiniCalendar";

/** Auto-refresh tiket open realtime tiap 1 menit (PRD §1). */
const REFRESH_INTERVAL_MS = 60 * 1000;

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Admin",
  user: "Petugas",
  supervisi: "Supervisi",
};

interface Props {
  initialData: SuperAdminDashboardData;
}

export function SuperAdminDashboardClient({ initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState<SuperAdminDashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/superadmin", { cache: "no-store" });
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
      <div className="flex items-center justify-end gap-3 text-sm">
        <span className="text-gray-400">
          Diperbarui {fmtTime(data.generatedAt)} · refresh otomatis tiap 1 menit
        </span>
        <Button variant="secondary" size="sm" onClick={refresh} loading={loading}>
          {!loading && <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <SuperAdminMetricCards counts={data.counts} />

      {/* Tabel tiket open realtime semua user. */}
      <Card padding="none">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <CardTitle>Tiket Open Realtime</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.openTickets.length} tiket open dari seluruh petugas. Klik untuk
              detail.
            </p>
          </div>
        </div>
        {data.openTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400">
            <TicketIcon className="w-8 h-8 mb-2" />
            <p className="text-sm">Tidak ada tiket open saat ini.</p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <tr>
                <Th>No Tiket</Th>
                <Th>Kategori</Th>
                <Th>Lokasi ATM</Th>
                <Th>Owner</Th>
                <Th>Shift</Th>
                <Th>Jam Open</Th>
                <Th>Status Supervisi</Th>
              </tr>
            </TableHead>
            <TableBody>
              {data.openTickets.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/weekly-monitoring/${t.id}`)}
                >
                  <Td className="font-mono font-semibold text-primary">
                    {t.noTiket}
                  </Td>
                  <Td>
                    <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                      {t.kategori === "atm" ? "ATM" : "Jaringan"}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-gray-500">
                      {t.kodeAtm}
                    </span>
                    <span className="block text-gray-700">{t.namaAtm}</span>
                  </Td>
                  <Td>{t.ownerNama}</Td>
                  <Td>
                    <Badge variant="neutral">Shift {t.shiftKode}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(t.waktuOpen)}</Td>
                  <Td>
                    <Badge
                      variant={
                        t.statusSupervisi === "approved" ? "success" : "warning"
                      }
                    >
                      {t.statusSupervisi === "approved"
                        ? "Sudah Approve"
                        : "Belum Approve"}
                    </Badge>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Kalender semua tiket + daftar per tanggal. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="lg">
          <CardTitle className="mb-4">Kalender Tiket</CardTitle>
          <MiniCalendar
            markedDates={markedDates}
            selected={selected}
            onSelect={setSelected}
          />
        </Card>
        <Card padding="lg">
          <CardTitle className="mb-4">Tiket pada Tanggal Terpilih</CardTitle>
          <DayList dateKey={selected} tickets={dayTickets} />
        </Card>
      </div>

      {/* Tabel member. */}
      <Card padding="none">
        <div className="p-5 border-b border-gray-100">
          <CardTitle>Member Aktif</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            {data.members.length} akun aktif. Klik nama untuk mengelola akun.
          </p>
        </div>
        <Table>
          <TableHead>
            <tr>
              <Th>Nama</Th>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Shift Aktif</Th>
              <Th>Terakhir Login</Th>
            </tr>
          </TableHead>
          <TableBody>
            {data.members.map((m) => (
              <TableRow
                key={m.id}
                className="cursor-pointer"
                onClick={() => router.push(`/manajemen-akun?edit=${m.id}`)}
              >
                <Td className="font-medium text-gray-800">{m.nama}</Td>
                <Td className="text-gray-600">@{m.username}</Td>
                <Td>
                  <Badge variant={m.role === "supervisi" ? "neutral" : "info"}>
                    {ROLE_LABELS[m.role]}
                  </Badge>
                </Td>
                <Td>
                  {m.currentShift ? (
                    <Badge variant="primary">Shift {m.currentShift}</Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-gray-600">
                  {m.lastLogin ? fmtDateTime(m.lastLogin) : "Belum pernah"}
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function DayList({
  dateKey,
  tickets,
}: {
  dateKey: string | null;
  tickets: SuperAdminOpenTicket[];
}) {
  const router = useRouter();

  if (!dateKey) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400">
        <CalendarDays className="w-8 h-8 mb-2" />
        <p className="text-sm">Pilih tanggal pada kalender untuk melihat tiket.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {fmtDate(dateKey)} · {tickets.length} tiket open
      </p>
      {tickets.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Tidak ada tiket open pada tanggal ini.
        </p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => router.push(`/weekly-monitoring/${t.id}`)}
                className="w-full text-left rounded-lg border border-gray-100 bg-surface-muted hover:bg-surface-subtle px-3 py-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-primary">
                    {t.noTiket}
                  </span>
                  <span className="text-xs text-gray-400">
                    {fmtTime(t.waktuOpen)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-gray-600 truncate">
                  <span className="font-mono">{t.kodeAtm}</span> · {t.namaAtm}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                    {t.kategori === "atm" ? "ATM" : "Jaringan"}
                  </Badge>
                  <Badge variant="neutral">Shift {t.shiftKode}</Badge>
                  <Badge variant="neutral">Petugas: {t.ownerNama}</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
