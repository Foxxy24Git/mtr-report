"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, CalendarRange, CheckCircle2, Clock, Timer } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { fmtDateTime } from "@/lib/format";
import { computeSla, menitToHHMM } from "@/lib/sla";
import { SHIFT_NAMES } from "@/lib/constants";
import type { ShiftCode } from "@/lib/shift";
import type { WeeklyTicketItem } from "@/lib/ticketQueries";

interface PicUser {
  id: string;
  username: string;
  nama: string;
}

interface Props {
  initialItems: WeeklyTicketItem[];
  initialFrom: string;
  initialTo: string;
  shifts: ShiftCode[];
  picUsers: PicUser[];
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 31;

export function WeeklyMonitoringClient({
  initialItems,
  initialFrom,
  initialTo,
  shifts,
  picUsers,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<WeeklyTicketItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [kategori, setKategori] = useState("");
  const [status, setStatus] = useState("");
  const [shift, setShift] = useState("");
  const [owner, setOwner] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // Peringatan rentang > 31 hari (server tetap melakukan clamp).
  const rangeTooWide = useMemo(() => {
    if (!from || !to || from > to) return false;
    const span =
      Math.round(
        (new Date(`${to}T00:00:00`).getTime() -
          new Date(`${from}T00:00:00`).getTime()) /
          DAY_MS
      ) + 1;
    return span > MAX_RANGE_DAYS;
  }, [from, to]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (kategori) qs.set("kategori", kategori);
      if (status) qs.set("status", status);
      if (shift) qs.set("shift", shift);
      if (owner) qs.set("owner", owner);
      if (search.trim()) qs.set("search", search.trim());
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/weekly?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
      // Sinkronkan rentang efektif (jika server melakukan clamp ke 31 hari).
      if (data.from && data.from !== from) setFrom(data.from);
      if (data.to && data.to !== to) setTo(data.to);
    } finally {
      setLoading(false);
    }
  }, [kategori, status, shift, owner, search, from, to]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(loadTickets, 250);
    return () => clearTimeout(handle);
  }, [loadTickets]);

  // Daftar vendor unik untuk dropdown filter (client-side, dari data termuat).
  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of items) if (t.vendor?.trim()) set.add(t.vendor.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Filter vendor diterapkan client-side; mempengaruhi tabel & ringkasan.
  const visibleItems = useMemo(
    () =>
      vendorFilter
        ? items.filter((t) => (t.vendor?.trim() ?? "") === vendorFilter)
        : items,
    [items, vendorFilter]
  );

  // Ringkasan minggu ini (mengikuti hasil filter aktif).
  const summary = useMemo(() => {
    const total = visibleItems.length;
    const selesai = visibleItems.filter((t) => t.status === "selesai");
    const proses = total - selesai.length;
    let totalMenit = 0;
    for (const t of selesai) {
      const sla = computeSla(
        new Date(t.waktuOpen),
        t.waktuSelesai ? new Date(t.waktuSelesai) : null
      );
      if (sla.lamaMenit != null) totalMenit += sla.lamaMenit;
    }
    const avg =
      selesai.length > 0 ? menitToHHMM(Math.round(totalMenit / selesai.length)) : "—";
    return { total, selesai: selesai.length, proses, avg };
  }, [visibleItems]);

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<CalendarRange className="w-4 h-4" />}
          label="Total Tiket"
          value={summary.total}
          tone="primary"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Selesai"
          value={summary.selesai}
          tone="success"
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="Masih Proses"
          value={summary.proses}
          tone="warning"
        />
        <SummaryCard
          icon={<Timer className="w-4 h-4" />}
          label="Rata-rata Penanganan"
          value={summary.avg}
          tone="neutral"
        />
      </div>

      {/* Filter & pencarian */}
      <div className="space-y-3 rounded-lg border border-gray-100 bg-surface-subtle/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari no tiket / lokasi ATM…"
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white w-64 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              aria-label="Cari tiket"
            />
          </div>

          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            className={SELECT_CLS}
            aria-label="Filter kategori"
          >
            <option value="">Semua Kategori</option>
            <option value="atm">ATM</option>
            <option value="jaringan">Jaringan</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={SELECT_CLS}
            aria-label="Filter status"
          >
            <option value="">Semua Status</option>
            <option value="proses">Proses</option>
            <option value="selesai">Selesai</option>
          </select>

          <select
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className={SELECT_CLS}
            aria-label="Filter shift"
          >
            <option value="">Semua Shift</option>
            {shifts.map((s) => (
              <option key={s} value={s}>
                {SHIFT_NAMES[s] ?? `Shift ${s}`}
              </option>
            ))}
          </select>

          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className={SELECT_CLS}
            aria-label="Filter PIC"
          >
            <option value="">Semua PIC</option>
            {picUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} — {u.nama}
              </option>
            ))}
          </select>

          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className={SELECT_CLS}
            aria-label="Filter vendor"
          >
            <option value="">Semua Vendor</option>
            {vendorOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <CalendarRange className="w-4 h-4 text-gray-400" />
          <span>Rentang:</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className={SELECT_CLS}
            aria-label="Tanggal dari"
          />
          <span>—</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className={SELECT_CLS}
            aria-label="Tanggal sampai"
          />
          {rangeTooWide && (
            <span className="text-xs text-amber-700">
              Maksimal 31 hari — rentang akan disesuaikan otomatis.
            </span>
          )}
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          <span className="ml-auto text-xs text-gray-500">
            {visibleItems.length} tiket
          </span>
        </div>
      </div>

      {/* Tabel */}
      <Table>
        <TableHead>
          <TableRow>
            <Th>No Tiket</Th>
            <Th>Kategori</Th>
            <Th>Kode / Lokasi ATM</Th>
            <Th>Tgl &amp; Jam Open</Th>
            <Th>Owner (PIC)</Th>
            <Th>Shift</Th>
            <Th>Status</Th>
            <Th>Lama Penanganan</Th>
            <Th>Supervisi</Th>
            <Th>Vendor</Th>
            <Th>Tiket Vendor</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibleItems.length === 0 ? (
            <TableRow>
              <Td colSpan={11} className="text-center text-gray-400 py-8">
                Tidak ada tiket pada rentang &amp; filter ini.
              </Td>
            </TableRow>
          ) : (
            visibleItems.map((t) => {
              const sla = computeSla(
                new Date(t.waktuOpen),
                t.waktuSelesai ? new Date(t.waktuSelesai) : null
              );
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/weekly-monitoring/${t.id}`)}
                >
                  <Td className="whitespace-nowrap">
                    <span className="font-mono font-semibold text-primary">
                      {t.noTiket}
                    </span>
                  </Td>
                  <Td>
                    <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                      {t.kategori === "atm" ? "ATM" : "Jaringan"}
                    </Badge>
                  </Td>
                  <Td className="font-mono font-medium text-gray-900">
                    {t.kodeAtm}
                    <div className="text-xs font-sans font-normal text-gray-500 max-w-[14rem] truncate">
                      {t.namaAtm}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {fmtDateTime(t.waktuOpen)}
                  </Td>
                  <Td className="whitespace-nowrap">{t.ownerNama}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-600">
                    {SHIFT_NAMES[t.shiftKode] ?? `Shift ${t.shiftKode}`}
                  </Td>
                  <Td>
                    <Badge variant={t.status === "selesai" ? "success" : "warning"}>
                      {t.status === "selesai" ? "Selesai" : "Proses"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {sla.lamaHHMM ? (
                      <span className="font-medium text-gray-700">
                        {sla.lamaHHMM}
                      </span>
                    ) : (
                      <span className="text-amber-600">Berjalan</span>
                    )}
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        t.statusSupervisi === "approved" ? "success" : "neutral"
                      }
                    >
                      {t.statusSupervisi === "approved"
                        ? "Sudah Approve"
                        : "Belum Approve"}
                    </Badge>
                  </Td>
                  <Td className="max-w-[10rem]">
                    {t.vendor?.trim() ? (
                      <span className="block truncate text-gray-700">
                        {t.vendor}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    {t.noTiketVendor?.trim() ? (
                      <span className="text-gray-700">{t.noTiketVendor}</span>
                    ) : (
                      <span className="font-sans text-gray-400">—</span>
                    )}
                  </Td>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "primary" | "success" | "warning" | "neutral";
}) {
  const toneCls = {
    primary: "text-primary bg-primary/10",
    success: "text-green-700 bg-green-100",
    warning: "text-amber-700 bg-amber-100",
    neutral: "text-gray-700 bg-gray-100",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneCls}`}>
        {icon}
      </span>
      <div>
        <div className="text-lg font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
