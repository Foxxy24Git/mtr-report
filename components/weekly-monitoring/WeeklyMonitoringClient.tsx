"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Search,
  CalendarRange,
  CheckCircle2,
  Clock,
  Timer,
  History,
  AlertTriangle,
  Gauge,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { fmtDateTime, fmtDateKey } from "@/lib/format";
import { computeSla, menitToHHMM, formatSlaPersen } from "@/lib/sla";
import { SHIFT_NAMES } from "@/lib/constants";
import type { ShiftCode } from "@/lib/shift";
import type { WeeklyTicketItem, AtmHistory } from "@/lib/ticketQueries";

interface PicUser {
  id: string;
  username: string;
  nama: string;
}

interface AtmOption {
  id: string;
  kodeAtm: string;
  namaAtm: string;
}

interface Props {
  initialItems: WeeklyTicketItem[];
  initialTotal: number;
  initialFrom: string;
  initialTo: string;
  shifts: ShiftCode[];
  picUsers: PicUser[];
  atmOptions: AtmOption[];
  vendorOptions: string[];
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const DAY_MS = 86_400_000;

type RangePreset = "7d" | "1m" | "3m" | "year" | "custom";

const atmLabel = (o: AtmOption) => `${o.kodeAtm} — ${o.namaAtm}`;

export function WeeklyMonitoringClient({
  initialItems,
  initialTotal,
  initialFrom,
  initialTo,
  shifts,
  picUsers,
  atmOptions,
  vendorOptions,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<WeeklyTicketItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);

  const [kategori, setKategori] = useState("");
  const [status, setStatus] = useState("");
  const [statusSupervisi, setStatusSupervisi] = useState("");
  const [shift, setShift] = useState("");
  const [owner, setOwner] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [preset, setPreset] = useState<RangePreset>("7d");

  // Filter ATM (autocomplete): teks input + id master yang terpilih.
  const [atmQuery, setAtmQuery] = useState("");
  const atmId = useMemo(() => {
    const q = atmQuery.trim();
    if (!q) return "";
    return atmOptions.find((o) => atmLabel(o) === q)?.id ?? "";
  }, [atmQuery, atmOptions]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (kategori) qs.set("kategori", kategori);
      if (status) qs.set("status", status);
      if (statusSupervisi) qs.set("statusSupervisi", statusSupervisi);
      if (shift) qs.set("shift", shift);
      if (owner) qs.set("owner", owner);
      if (vendorFilter) qs.set("vendor", vendorFilter);
      if (atmId) qs.set("atmId", atmId);
      if (search.trim()) qs.set("search", search.trim());
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/weekly?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      // Sinkronkan rentang efektif (jika server melakukan clamp).
      if (data.from && data.from !== from) setFrom(data.from);
      if (data.to && data.to !== to) setTo(data.to);
    } finally {
      setLoading(false);
    }
  }, [
    kategori,
    status,
    statusSupervisi,
    shift,
    owner,
    vendorFilter,
    atmId,
    search,
    from,
    to,
  ]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(loadTickets, 250);
    return () => clearTimeout(handle);
  }, [loadTickets]);

  // Ringkasan riwayat ATM (PRD §4.7) saat satu ATM dipilih di filter.
  const [atmHistory, setAtmHistory] = useState<AtmHistory | null>(null);
  const [atmHistoryLoading, setAtmHistoryLoading] = useState(false);
  useEffect(() => {
    if (!atmId) {
      setAtmHistory(null);
      return;
    }
    let cancelled = false;
    setAtmHistoryLoading(true);
    fetch(`/api/weekly/atm-history?atmId=${encodeURIComponent(atmId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setAtmHistory(data);
      })
      .finally(() => {
        if (!cancelled) setAtmHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [atmId]);

  // Shortcut rentang tanggal (PRD §4.4).
  function applyPreset(p: Exclude<RangePreset, "custom">) {
    const now = new Date();
    const todayKey = fmtDateKey(now);
    let fromKey = todayKey;
    if (p === "7d") fromKey = fmtDateKey(new Date(now.getTime() - 6 * DAY_MS));
    else if (p === "1m")
      fromKey = fmtDateKey(new Date(now.getTime() - 29 * DAY_MS));
    else if (p === "3m")
      fromKey = fmtDateKey(new Date(now.getTime() - 89 * DAY_MS));
    else if (p === "year") fromKey = `${now.getFullYear()}-01-01`;
    setFrom(fromKey);
    setTo(todayKey);
    setPreset(p);
  }

  // Ringkasan minggu/rentang ini (mengikuti hasil filter aktif).
  const summary = useMemo(() => {
    const totalShown = items.length;
    const selesai = items.filter((t) => t.status === "selesai");
    const proses = totalShown - selesai.length;
    let totalMenit = 0;
    for (const t of selesai) {
      const sla = computeSla(
        new Date(t.waktuOpen),
        t.waktuSelesai ? new Date(t.waktuSelesai) : null
      );
      if (sla.lamaMenit != null) totalMenit += sla.lamaMenit;
    }
    const avg =
      selesai.length > 0
        ? menitToHHMM(Math.round(totalMenit / selesai.length))
        : "—";
    return { total: totalShown, selesai: selesai.length, proses, avg };
  }, [items]);

  const hasActiveFilter =
    !!kategori ||
    !!status ||
    !!statusSupervisi ||
    !!shift ||
    !!owner ||
    !!vendorFilter ||
    !!atmId ||
    !!search.trim();

  const selectedAtm = atmOptions.find((o) => o.id === atmId) ?? null;

  return (
    <div className="space-y-4">
      {/* Search bar utama (prominent) */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari no tiket, kode/lokasi ATM, vendor, no tiket vendor, atau isi kegiatan…"
          className="w-full pl-12 pr-4 py-3 text-base rounded-xl border border-gray-200 bg-white shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          aria-label="Cari tiket"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<CalendarRange className="w-4 h-4" />}
          label="Tiket Tampil"
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

      {/* Riwayat ATM terpilih (PRD §4.7) */}
      {selectedAtm && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <History className="w-4 h-4" />
            Riwayat ATM{" "}
            <span className="font-mono">{selectedAtm.kodeAtm}</span> —{" "}
            {selectedAtm.namaAtm}
          </div>
          {atmHistoryLoading ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat riwayat…
            </p>
          ) : atmHistory ? (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <AtmStat
                icon={<History className="w-4 h-4" />}
                label="Total Tiket (sepanjang data)"
                value={atmHistory.total.toLocaleString("id-ID")}
              />
              <AtmStat
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Gangguan Terbanyak"
                value={
                  atmHistory.topGangguan
                    ? `${atmHistory.topGangguan.nilai} (${atmHistory.topGangguan.count}×)`
                    : "—"
                }
              />
              <AtmStat
                icon={<Gauge className="w-4 h-4" />}
                label="Rata-rata SLA / Lama"
                value={
                  atmHistory.avgSlaPersen != null
                    ? `${formatSlaPersen(atmHistory.avgSlaPersen)} · ${
                        atmHistory.avgLamaMenit != null
                          ? menitToHHMM(atmHistory.avgLamaMenit)
                          : "—"
                      }`
                    : "Belum ada tiket selesai"
                }
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              Tidak ada riwayat untuk ATM ini.
            </p>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="space-y-3 rounded-lg border border-gray-100 bg-surface-subtle/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Autocomplete ATM */}
          <div className="relative">
            <input
              type="text"
              value={atmQuery}
              onChange={(e) => setAtmQuery(e.target.value)}
              list="weekly-atm-options"
              placeholder="Kode / lokasi ATM…"
              className={`${SELECT_CLS} w-60 pr-7`}
              aria-label="Filter kode atau lokasi ATM"
            />
            {atmQuery && (
              <button
                type="button"
                onClick={() => setAtmQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Hapus filter ATM"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <datalist id="weekly-atm-options">
              {atmOptions.map((o) => (
                <option key={o.id} value={atmLabel(o)} />
              ))}
            </datalist>
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
            value={statusSupervisi}
            onChange={(e) => setStatusSupervisi(e.target.value)}
            className={SELECT_CLS}
            aria-label="Filter status supervisi"
          >
            <option value="">Semua Supervisi</option>
            <option value="belum">Belum Approve</option>
            <option value="approved">Sudah Approve</option>
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

        {/* Rentang tanggal + shortcut */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <CalendarRange className="w-4 h-4 text-gray-400" />
          <div className="flex flex-wrap items-center gap-1">
            <PresetButton
              active={preset === "7d"}
              onClick={() => applyPreset("7d")}
            >
              7 Hari
            </PresetButton>
            <PresetButton
              active={preset === "1m"}
              onClick={() => applyPreset("1m")}
            >
              1 Bulan
            </PresetButton>
            <PresetButton
              active={preset === "3m"}
              onClick={() => applyPreset("3m")}
            >
              3 Bulan
            </PresetButton>
            <PresetButton
              active={preset === "year"}
              onClick={() => applyPreset("year")}
            >
              Tahun Ini
            </PresetButton>
          </div>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className={SELECT_CLS}
            aria-label="Tanggal dari"
          />
          <span>—</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className={SELECT_CLS}
            aria-label="Tanggal sampai"
          />
          <span className="ml-auto text-xs text-gray-500">
            Menampilkan {items.length.toLocaleString("id-ID")} tiket dari{" "}
            {total.toLocaleString("id-ID")} total.
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
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={11} className="text-center text-gray-400 py-8">
                {hasActiveFilter
                  ? "Tidak ditemukan tiket yang cocok dengan pencarian."
                  : "Tidak ada tiket pada rentang ini."}
              </Td>
            </TableRow>
          ) : (
            items.map((t) => {
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
                      <Highlight text={t.noTiket} term={search} />
                    </span>
                  </Td>
                  <Td>
                    <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                      {t.kategori === "atm" ? "ATM" : "Jaringan"}
                    </Badge>
                  </Td>
                  <Td className="font-mono font-medium text-gray-900">
                    <Highlight text={t.kodeAtm} term={search} />
                    <div className="text-xs font-sans font-normal text-gray-500 max-w-[14rem] truncate">
                      <Highlight text={t.namaAtm} term={search} />
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
                        <Highlight text={t.vendor} term={search} />
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    {t.noTiketVendor?.trim() ? (
                      <span className="text-gray-700">
                        <Highlight text={t.noTiketVendor} term={search} />
                      </span>
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

/** Menyorot bagian teks yang cocok dengan kata kunci pencarian. */
function Highlight({ text, term }: { text: string; term: string }) {
  const q = term.trim();
  if (!q || !text) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let rest = text;
  let lowerRest = lowerText;
  let key = 0;
  while (true) {
    const i = lowerRest.indexOf(lowerQ);
    if (i === -1) {
      parts.push(rest);
      break;
    }
    if (i > 0) parts.push(rest.slice(0, i));
    parts.push(
      <mark
        key={key++}
        className="rounded bg-yellow-200 px-0.5 text-gray-900"
      >
        {rest.slice(i, i + q.length)}
      </mark>
    );
    rest = rest.slice(i + q.length);
    lowerRest = lowerRest.slice(i + q.length);
  }
  return <>{parts}</>;
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-gray-300 bg-white text-gray-600 hover:border-primary/50 hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function AtmStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-white border border-gray-100 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-semibold text-gray-900">{value}</div>
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
