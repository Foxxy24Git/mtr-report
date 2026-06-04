"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Gauge,
  Ticket,
  Timer,
  ServerCrash,
  CalendarRange,
  AlertTriangle,
  Loader2,
  RotateCw,
  FileSpreadsheet,
  Download,
  X,
} from "lucide-react";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { menitToHHMM } from "@/lib/sla";
import { DonutChart } from "./DonutChart";

// ----------------------------- Tipe respons API (Fase 1) -----------------------------

interface SlaSummary {
  totalTiket: number;
  totalDowntimeMenit: number;
  rataSlaSemua: number;
  rataSlaSemuaLabel: string;
  atmBermasalah: number;
  jaringanBermasalah: number;
}
interface LowestRow {
  atmId: string | null;
  kodeAtm: string;
  lokasi: string;
  vendor: string;
  totalTiket: number;
  totalDowntimeMenit: number;
  slaPersen: number;
  slaPersenLabel: string;
}
interface MostTroubleRow {
  atmId: string | null;
  kodeAtm: string;
  lokasi: string;
  vendor: string;
  kategori: "atm" | "jaringan" | null;
  jumlahTiket: number;
  jumlahSelesai: number;
  jumlahProses: number;
}
interface GroupRow {
  nilai: string;
  jumlah: number;
}

interface SlaData {
  summary: SlaSummary;
  lowest: LowestRow[];
  mostTrouble: MostTroubleRow[];
  byJenis: { total: number; items: GroupRow[] };
  bySumber: { total: number; items: GroupRow[] };
}

// ----------------------------- Helper -----------------------------

const DAY_MS = 86_400_000;
const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

type Preset = "7d" | "30d" | "3m" | "custom";
type Kategori = "semua" | "atm" | "jaringan";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function defaultRange() {
  const today = new Date();
  return { dari: dateKey(new Date(today.getTime() - 29 * DAY_MS)), sampai: dateKey(today) };
}

/** Warna SLA: >99% hijau, 95–99% kuning, <95% merah. `frac` 0..1. */
function slaTone(frac: number): string {
  const p = frac * 100;
  if (p > 99) return "text-green-600";
  if (p >= 95) return "text-amber-600";
  return "text-red-600";
}
function slaCardTone(frac: number): { text: string; bg: string } {
  const p = frac * 100;
  if (p > 99) return { text: "text-green-700", bg: "bg-green-100" };
  if (p >= 95) return { text: "text-amber-700", bg: "bg-amber-100" };
  return { text: "text-red-700", bg: "bg-red-100" };
}

// ----------------------------- Komponen utama -----------------------------

export function MonitoringSlaClient() {
  const init = useRef(defaultRange());
  const [dari, setDari] = useState(init.current.dari);
  const [sampai, setSampai] = useState(init.current.sampai);
  const [kategori, setKategori] = useState<Kategori>("semua");
  const [preset, setPreset] = useState<Preset>("30d");

  const [data, setData] = useState<SlaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(
    async (f: { dari: string; sampai: string; kategori: Kategori }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          dari: f.dari,
          sampai: f.sampai,
          kategori: f.kategori,
        }).toString();
        const [summary, lowest, mostTrouble, byJenis, bySumber] = await Promise.all([
          fetch(`/api/sla/summary?${qs}`).then(okJson),
          fetch(`/api/sla/lowest?${qs}`).then(okJson),
          fetch(`/api/sla/most-trouble?${qs}`).then(okJson),
          fetch(`/api/sla/by-jenis-gangguan?${qs}`).then(okJson),
          fetch(`/api/sla/by-sumber-penyebab?${qs}`).then(okJson),
        ]);
        setData({
          summary,
          lowest: lowest.items ?? [],
          mostTrouble: mostTrouble.items ?? [],
          byJenis: { total: byJenis.total ?? 0, items: byJenis.items ?? [] },
          bySumber: { total: bySumber.total ?? 0, items: bySumber.items ?? [] },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data SLA.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Muat awal.
  useEffect(() => {
    load({ dari: init.current.dari, sampai: init.current.sampai, kategori: "semua" });
  }, [load]);

  function applyPreset(p: Exclude<Preset, "custom">) {
    const today = new Date();
    const todayKey = dateKey(today);
    const back = p === "7d" ? 6 : p === "30d" ? 29 : 89;
    const fromKey = dateKey(new Date(today.getTime() - back * DAY_MS));
    setDari(fromKey);
    setSampai(todayKey);
    setPreset(p);
    load({ dari: fromKey, sampai: todayKey, kategori });
  }

  function applyFilter() {
    load({ dari, sampai, kategori });
  }

  const empty = !loading && !error && data && data.summary.totalTiket === 0;

  return (
    <div className="space-y-5">
      {/* 1. Filter bar (sticky) */}
      <div className="sticky top-0 z-20 -mx-1 rounded-xl border border-gray-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <PresetButton active={preset === "7d"} onClick={() => applyPreset("7d")}>
              7 Hari
            </PresetButton>
            <PresetButton active={preset === "30d"} onClick={() => applyPreset("30d")}>
              30 Hari
            </PresetButton>
            <PresetButton active={preset === "3m"} onClick={() => applyPreset("3m")}>
              3 Bulan
            </PresetButton>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarRange className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={dari}
              max={sampai}
              onChange={(e) => {
                setDari(e.target.value);
                setPreset("custom");
              }}
              className={SELECT_CLS}
              aria-label="Tanggal dari"
            />
            <span>—</span>
            <input
              type="date"
              value={sampai}
              min={dari}
              onChange={(e) => {
                setSampai(e.target.value);
                setPreset("custom");
              }}
              className={SELECT_CLS}
              aria-label="Tanggal sampai"
            />
          </div>

          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value as Kategori)}
            className={SELECT_CLS}
            aria-label="Filter kategori"
          >
            <option value="semua">Semua Kategori</option>
            <option value="atm">ATM</option>
            <option value="jaringan">Jaringan</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/10"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Laporan Permasalahan
            </button>
            <button
              type="button"
              onClick={applyFilter}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              Terapkan Filter
            </button>
          </div>
        </div>
      </div>

      <DownloadPermasalahanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={{ dari, sampai, kategori }}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading && !data ? (
        <LoadingState />
      ) : empty ? (
        <EmptyState />
      ) : data ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="space-y-5"
        >
          {/* 2. Kartu ringkasan */}
          <Section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SlaSummaryCard summary={data.summary} />
              <StatCard
                icon={<Ticket className="h-5 w-5" />}
                tone="primary"
                label="Total Tiket Periode"
                value={data.summary.totalTiket.toLocaleString("id-ID")}
              />
              <StatCard
                icon={<Timer className="h-5 w-5" />}
                tone="neutral"
                label="Total Downtime (jam:menit)"
                value={menitToHHMM(data.summary.totalDowntimeMenit)}
              />
              <StatCard
                icon={<ServerCrash className="h-5 w-5" />}
                tone="warning"
                label="ATM / Jaringan Bermasalah"
                value={(
                  data.summary.atmBermasalah + data.summary.jaringanBermasalah
                ).toLocaleString("id-ID")}
                sub={`${data.summary.atmBermasalah} ATM · ${data.summary.jaringanBermasalah} Jaringan`}
              />
            </div>
          </Section>

          {/* 3. SLA terendah */}
          <Section>
            <Card title="SLA Terendah" subtitle="ATM/lokasi paling bermasalah pada periode">
              <Table>
                <TableHead>
                  <TableRow>
                    <Th className="w-12">Rank</Th>
                    <Th>Kode ATM</Th>
                    <Th>Lokasi</Th>
                    <Th>Vendor</Th>
                    <Th className="text-right">Total Tiket</Th>
                    <Th className="text-right">Downtime</Th>
                    <Th className="text-right">SLA%</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lowest.length === 0 ? (
                    <TableRow>
                      <Td colSpan={7} className="py-8 text-center text-gray-400">
                        Tidak ada tiket selesai pada rentang ini.
                      </Td>
                    </TableRow>
                  ) : (
                    data.lowest.map((r, i) => (
                      <TableRow
                        key={(r.atmId ?? r.kodeAtm) + i}
                        className={i < 3 ? "bg-red-50/50" : undefined}
                      >
                        <Td>
                          <RankBadge rank={i + 1} highlight={i < 3} />
                        </Td>
                        <Td className="font-mono font-semibold text-gray-900">
                          {r.kodeAtm}
                        </Td>
                        <Td className="max-w-[16rem] truncate text-gray-600">
                          {r.lokasi}
                        </Td>
                        <Td className="text-gray-600">{r.vendor}</Td>
                        <Td className="text-right">{r.totalTiket}</Td>
                        <Td className="text-right font-mono text-xs">
                          {menitToHHMM(r.totalDowntimeMenit)}
                        </Td>
                        <Td className={`text-right font-semibold ${slaTone(r.slaPersen)}`}>
                          {r.slaPersenLabel}
                        </Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </Section>

          {/* 4. Paling sering bermasalah */}
          <Section>
            <Card
              title="Paling Sering Bermasalah"
              subtitle="Frekuensi tiket terbanyak (proses & selesai)"
            >
              <Table>
                <TableHead>
                  <TableRow>
                    <Th className="w-12">Rank</Th>
                    <Th>Kode ATM</Th>
                    <Th>Lokasi</Th>
                    <Th>Vendor</Th>
                    <Th>Kategori</Th>
                    <Th>Jumlah Tiket</Th>
                    <Th className="text-right">Selesai</Th>
                    <Th className="text-right">Proses</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.mostTrouble.length === 0 ? (
                    <TableRow>
                      <Td colSpan={8} className="py-8 text-center text-gray-400">
                        Tidak ada tiket pada rentang ini.
                      </Td>
                    </TableRow>
                  ) : (
                    (() => {
                      const max = Math.max(...data.mostTrouble.map((r) => r.jumlahTiket), 1);
                      return data.mostTrouble.map((r, i) => (
                        <TableRow key={(r.atmId ?? r.kodeAtm) + i}>
                          <Td>
                            <RankBadge rank={i + 1} highlight={i < 3} />
                          </Td>
                          <Td className="font-mono font-semibold text-gray-900">
                            {r.kodeAtm}
                          </Td>
                          <Td className="max-w-[14rem] truncate text-gray-600">
                            {r.lokasi}
                          </Td>
                          <Td className="text-gray-600">{r.vendor}</Td>
                          <Td>
                            <Badge variant={r.kategori === "atm" ? "info" : "neutral"}>
                              {r.kategori === "atm" ? "ATM" : "Jaringan"}
                            </Badge>
                          </Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${(r.jumlahTiket / max) * 100}%` }}
                                />
                              </div>
                              <span className="w-6 text-sm font-semibold text-gray-900">
                                {r.jumlahTiket}
                              </span>
                            </div>
                          </Td>
                          <Td className="text-right text-green-600">{r.jumlahSelesai}</Td>
                          <Td className="text-right text-amber-600">{r.jumlahProses}</Td>
                        </TableRow>
                      ));
                    })()
                  )}
                </TableBody>
              </Table>
            </Card>
          </Section>

          {/* 5. Dua chart berdampingan */}
          <Section>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Distribusi per Jenis Gangguan">
                <DonutChart
                  slices={data.byJenis.items.map((g) => ({ label: g.nilai, value: g.jumlah }))}
                  total={data.byJenis.total}
                />
              </Card>
              <Card title="Distribusi per Sumber Penyebab">
                <DonutChart
                  slices={data.bySumber.items.map((g) => ({ label: g.nilai, value: g.jumlah }))}
                  total={data.bySumber.total}
                />
              </Card>
            </div>
          </Section>
        </motion.div>
      ) : null}
    </div>
  );
}

// ----------------------------- Subkomponen -----------------------------

async function okJson(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Gagal memuat (${res.status}).`);
  }
  return res.json();
}

/** Picu unduhan file dari endpoint; tangani error JSON (400/401) dengan rapi. */
async function downloadFile(
  url: string,
  fallbackName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? `Gagal mengunduh (${res.status}).` };
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(cd);
  const name = match?.[1] ?? fallbackName;

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
  return { ok: true };
}

type JenisLaporan = "frekuensi" | "sla";

/** Modal sebelum unduh "Laporan Permasalahan" — pilih rentang, kategori, jenis. */
function DownloadPermasalahanModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: { dari: string; sampai: string; kategori: Kategori };
}) {
  const [dari, setDari] = useState(initial.dari);
  const [sampai, setSampai] = useState(initial.sampai);
  const [kategori, setKategori] = useState<Kategori>(initial.kategori);
  const [jenis, setJenis] = useState<JenisLaporan>("frekuensi");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sinkronkan dengan filter aktif tiap kali modal dibuka.
  useEffect(() => {
    if (open) {
      setDari(initial.dari);
      setSampai(initial.sampai);
      setKategori(initial.kategori);
      setError(null);
    }
  }, [open, initial.dari, initial.sampai, initial.kategori]);

  if (!open) return null;

  async function unduh() {
    setError(null);
    if (!dari || !sampai) {
      setError("Pilih rentang tanggal terlebih dahulu.");
      return;
    }
    if (dari > sampai) {
      setError("Tanggal 'dari' tidak boleh setelah tanggal 'sampai'.");
      return;
    }
    setLoading(true);
    const qs = new URLSearchParams({ dari, sampai, kategori, jenis }).toString();
    const res = await downloadFile(
      `/api/sla/laporan-permasalahan?${qs}`,
      `LAPORAN_PERMASALAHAN_${kategori.toUpperCase()}_${dari}_sd_${sampai}.xlsx`
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Download Laporan Permasalahan
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              File Excel acuan koordinasi ke vendor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Rentang tanggal */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Rentang Tanggal
            </label>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={dari}
                max={sampai}
                onChange={(e) => setDari(e.target.value)}
                className={SELECT_CLS}
                aria-label="Tanggal dari"
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={sampai}
                min={dari}
                onChange={(e) => setSampai(e.target.value)}
                className={SELECT_CLS}
                aria-label="Tanggal sampai"
              />
            </div>
          </div>

          {/* Kategori */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Kategori
            </label>
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value as Kategori)}
              className={`${SELECT_CLS} w-full`}
            >
              <option value="semua">Semua</option>
              <option value="atm">ATM</option>
              <option value="jaringan">Jaringan</option>
            </select>
          </div>

          {/* Jenis laporan */}
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Jenis Laporan
            </span>
            <div className="space-y-2">
              <RadioRow
                checked={jenis === "frekuensi"}
                onChange={() => setJenis("frekuensi")}
                title="ATM/Jaringan Paling Bermasalah"
                desc="Urut berdasarkan frekuensi tiket terbanyak."
              />
              <RadioRow
                checked={jenis === "sla"}
                onChange={() => setJenis("sla")}
                title="SLA Terendah"
                desc="Urut berdasarkan SLA periode terendah."
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={unduh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        checked
          ? "border-primary bg-primary/5"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{desc}</span>
      </span>
    </label>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
      }}
    >
      {children}
    </motion.div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "success" | "warning" | "neutral";
}) {
  const toneCls = {
    primary: "text-primary bg-primary/10",
    success: "text-green-700 bg-green-100",
    warning: "text-amber-700 bg-amber-100",
    neutral: "text-gray-700 bg-gray-100",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${toneCls}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-xl font-bold leading-tight text-gray-900">
          {value}
        </div>
        <div className="text-xs text-gray-500">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

function SlaSummaryCard({ summary }: { summary: SlaSummary }) {
  const tone = slaCardTone(summary.rataSlaSemua);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}>
        <Gauge className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className={`text-xl font-bold leading-tight ${tone.text}`}>
          {summary.rataSlaSemuaLabel}
        </div>
        <div className="text-xs text-gray-500">Rata-rata SLA Keseluruhan</div>
      </div>
    </div>
  );
}

function RankBadge({ rank, highlight }: { rank: number; highlight: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
        highlight ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {rank}
    </span>
  );
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
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-gray-300 bg-white text-gray-600 hover:border-primary/50 hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[78px] animate-pulse rounded-xl border border-gray-100 bg-gray-100/70"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-gray-100 bg-gray-100/70" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl border border-gray-100 bg-gray-100/70" />
        <div className="h-56 animate-pulse rounded-xl border border-gray-100 bg-gray-100/70" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
      <Gauge className="mb-3 h-10 w-10 text-gray-300" />
      <p className="text-sm font-medium text-gray-600">
        Tidak ada tiket pada rentang & kategori ini.
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Coba perluas rentang tanggal atau ubah filter kategori.
      </p>
    </div>
  );
}
