"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Thermometer,
  Server as ServerIcon,
  Check,
  Loader2,
  CalendarSearch,
  Power,
  PowerOff,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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
import { cn } from "@/lib/cn";
import { fmtTime } from "@/lib/format";
import {
  SERVERS,
  SERVER_STATUS_OPTIONS,
  AC_URUTAN,
  SERVER_FASES,
  FASE_LABELS,
  type ServerFaseValue,
} from "@/lib/suhuServer";
import { SHIFT_LABELS } from "@/lib/constants";

// ----------------------------- Tipe -----------------------------

export interface AcLog {
  id: string;
  urutan: number;
  waktuPantau: string;
  suhuRoomServer: string | null;
  suhuPanel: string | null;
  statusAktifKiri: boolean;
  statusAktifKanan: boolean;
  pantau12jamKiri: string | null;
  pantau12jamKanan: string | null;
}

export interface ServerLog {
  id: string;
  fase: ServerFaseValue;
  npay: string | null;
  ajAtmb: string | null;
  bifast: string | null;
  prima: string | null;
  cipHost: string | null;
}

interface Props {
  tanggal: string; // YYYY-MM-DD (hari ini, WIB)
  tanggalLabel: string;
  shift: string;
  nama: string;
  initialAc: AcLog[];
  initialServer: ServerLog[];
}

// ----------------------------- Util waktu -----------------------------

/** ISO → "HH:mm" pada zona WIB untuk <input type="time">. */
function isoToTimeWIB(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

/** Gabung tanggal (YYYY-MM-DD) + waktu (HH:mm) → ISO. Diinterpretasi waktu lokal browser (WIB). */
function buildWaktuISO(tanggal: string, time: string): string {
  return new Date(`${tanggal}T${time}:00`).toISOString();
}

// ----------------------------- Toggle Aktif/Mati -----------------------------

function StatusToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors",
          value
            ? "bg-green-600 text-white"
            : "bg-white text-gray-500 hover:bg-gray-50"
        )}
      >
        <Power className="w-3.5 h-3.5" /> Aktif
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-300",
          !value
            ? "bg-gray-600 text-white"
            : "bg-white text-gray-500 hover:bg-gray-50"
        )}
      >
        <PowerOff className="w-3.5 h-3.5" /> Mati
      </button>
    </div>
  );
}

function SavedFlash({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="inline-flex items-center gap-1 text-xs font-medium text-green-700"
        >
          <Check className="w-3.5 h-3.5" /> Tersimpan
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ----------------------------- Form 1 pengecekan AC -----------------------------

function AcCheckRow({
  urutan,
  tanggal,
  existing,
  onSaved,
}: {
  urutan: number;
  tanggal: string;
  existing?: AcLog;
  onSaved: () => void;
}) {
  const [waktu, setWaktu] = useState(
    existing ? isoToTimeWIB(existing.waktuPantau) : ""
  );
  const [room, setRoom] = useState(existing?.suhuRoomServer ?? "");
  const [panel, setPanel] = useState(existing?.suhuPanel ?? "");
  const [kiri, setKiri] = useState(existing?.statusAktifKiri ?? true);
  const [kanan, setKanan] = useState(existing?.statusAktifKanan ?? true);
  const [p12kiri, setP12kiri] = useState(existing?.pantau12jamKiri ?? "");
  const [p12kanan, setP12kanan] = useState(existing?.pantau12jamKanan ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!waktu) {
      setError("Waktu pemantauan wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/suhu-server/ac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal,
          urutan,
          waktuPantau: buildWaktuISO(tanggal, waktu),
          suhuRoomServer: room,
          suhuPanel: panel,
          statusAktifKiri: kiri,
          statusAktifKanan: kanan,
          pantau12jamKiri: p12kiri,
          pantau12jamKanan: p12kanan,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span className="w-6 h-6 rounded-full bg-primary-50 text-primary text-xs flex items-center justify-center font-bold">
            {urutan}
          </span>
          Pengecekan ke-{urutan}
        </span>
        <SavedFlash show={saved} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label="Waktu Pemantauan"
          type="time"
          required
          value={waktu}
          onChange={(e) => setWaktu(e.target.value)}
        />
        <Input
          label="Suhu Room Server"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="cth. 22°C"
        />
        <Input
          label="Suhu Ruangan Panel"
          value={panel}
          onChange={(e) => setPanel(e.target.value)}
          placeholder="cth. 24°C"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Status AC Kiri
          </span>
          <StatusToggle value={kiri} onChange={setKiri} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Status AC Kanan
          </span>
          <StatusToggle value={kanan} onChange={setKanan} />
        </div>
        <Input
          label="Pemantauan 12 jam (Kiri)"
          value={p12kiri}
          onChange={(e) => setP12kiri(e.target.value)}
          placeholder="cth. Normal"
        />
        <Input
          label="Pemantauan 12 jam (Kanan)"
          value={p12kanan}
          onChange={(e) => setP12kanan(e.target.value)}
          placeholder="cth. Normal"
        />
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end mt-3">
        <Button size="sm" loading={saving} onClick={save}>
          Simpan Pengecekan {urutan}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------- Form log server 1 fase -----------------------------

function ServerFaseForm({
  fase,
  tanggal,
  existing,
  onSaved,
}: {
  fase: ServerFaseValue;
  tanggal: string;
  existing?: ServerLog;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    npay: existing?.npay ?? "",
    ajAtmb: existing?.ajAtmb ?? "",
    bifast: existing?.bifast ?? "",
    prima: existing?.prima ?? "",
    cipHost: existing?.cipHost ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/suhu-server/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal, fase, ...vals }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-800">
          {FASE_LABELS[fase]}
        </span>
        <SavedFlash show={saved} />
      </div>

      <div className="space-y-3">
        {SERVERS.map((s) => (
          <Select
            key={s.key}
            label={s.label}
            value={vals[s.key]}
            onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })}
          >
            <option value="">— Pilih status —</option>
            {SERVER_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        ))}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end mt-3">
        <Button size="sm" loading={saving} onClick={save}>
          Simpan {FASE_LABELS[fase]}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------- Ringkasan per tanggal+shift -----------------------------

const ALL_SHIFTS = ["A", "B", "C", "D", "E"];

function Ringkasan({
  initialTanggal,
  initialShift,
  refreshKey,
}: {
  initialTanggal: string;
  initialShift: string;
  refreshKey: number;
}) {
  const [tanggal, setTanggal] = useState(initialTanggal);
  const [shift, setShift] = useState(initialShift);
  const [acLogs, setAcLogs] = useState<AcLog[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/suhu-server?tanggal=${tanggal}&shift=${shift}`
      );
      const data = await res.json().catch(() => ({}));
      setAcLogs(data.acLogs ?? []);
      setServerLogs(data.serverLogs ?? []);
    } finally {
      setLoading(false);
    }
  }, [tanggal, shift]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const serverByFase = (f: ServerFaseValue) =>
    serverLogs.find((s) => s.fase === f);

  return (
    <Card padding="lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSearch className="w-4 h-4 text-primary" /> Ringkasan per
          Tanggal &amp; Shift
        </CardTitle>
        {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
      </CardHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-5 max-w-md">
        <Input
          label="Tanggal"
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
        />
        <Select
          label="Shift"
          value={shift}
          onChange={(e) => setShift(e.target.value)}
        >
          {ALL_SHIFTS.map((s) => (
            <option key={s} value={s}>
              Shift {s}
            </option>
          ))}
        </Select>
      </div>

      {/* Tabel Suhu AC */}
      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <Thermometer className="w-4 h-4 text-primary" /> Suhu AC
      </h4>
      <Table>
        <TableHead>
          <TableRow>
            <Th>Cek</Th>
            <Th>Waktu</Th>
            <Th>Room Server</Th>
            <Th>Panel</Th>
            <Th>AC Kiri</Th>
            <Th>AC Kanan</Th>
            <Th>12 jam (Ki/Ka)</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {AC_URUTAN.map((u) => {
            const log = acLogs.find((a) => a.urutan === u);
            return (
              <TableRow key={u}>
                <Td className="font-medium">{u}</Td>
                <Td>{log ? fmtTime(log.waktuPantau) : "—"}</Td>
                <Td>{log?.suhuRoomServer ?? "—"}</Td>
                <Td>{log?.suhuPanel ?? "—"}</Td>
                <Td>
                  {log ? (
                    <Badge variant={log.statusAktifKiri ? "success" : "neutral"}>
                      {log.statusAktifKiri ? "Aktif" : "Mati"}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {log ? (
                    <Badge
                      variant={log.statusAktifKanan ? "success" : "neutral"}
                    >
                      {log.statusAktifKanan ? "Aktif" : "Mati"}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-xs">
                  {log
                    ? `${log.pantau12jamKiri ?? "—"} / ${log.pantau12jamKanan ?? "—"}`
                    : "—"}
                </Td>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Tabel Log Server */}
      <h4 className="text-sm font-semibold text-gray-700 mt-6 mb-2 flex items-center gap-2">
        <ServerIcon className="w-4 h-4 text-primary" /> Log Server
      </h4>
      <Table>
        <TableHead>
          <TableRow>
            <Th>Server</Th>
            {SERVER_FASES.map((f) => (
              <Th key={f}>{FASE_LABELS[f]}</Th>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {SERVERS.map((s) => (
            <TableRow key={s.key}>
              <Td className="font-medium">{s.label}</Td>
              {SERVER_FASES.map((f) => {
                const log = serverByFase(f);
                const val = log?.[s.key] ?? null;
                return (
                  <Td key={f}>
                    {val ? (
                      <Badge variant={val === "Gangguan" ? "danger" : "success"}>
                        {val}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ----------------------------- Komponen utama -----------------------------

export function SuhuServerClient({
  tanggal,
  tanggalLabel,
  shift,
  nama,
  initialAc,
  initialServer,
}: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const acByUrutan = (u: number) => initialAc.find((a) => a.urutan === u);
  const serverByFase = (f: ServerFaseValue) =>
    initialServer.find((s) => s.fase === f);

  return (
    <div className="space-y-6">
      <Card className="bg-primary-50/40 border-primary-100" padding="md">
        <p className="text-sm text-gray-700">
          Pengisian untuk{" "}
          <span className="font-semibold text-gray-900">{tanggalLabel}</span> ·{" "}
          {SHIFT_LABELS[shift] ?? `Shift ${shift}`} · Petugas{" "}
          <span className="font-semibold text-gray-900">{nama}</span>
        </p>
      </Card>

      {/* Suhu AC */}
      <Card padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-primary" /> Suhu AC — 3×
            Pengecekan
          </CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {AC_URUTAN.map((u) => (
            <AcCheckRow
              key={u}
              urutan={u}
              tanggal={tanggal}
              existing={acByUrutan(u)}
              onSaved={bump}
            />
          ))}
        </div>
      </Card>

      {/* Log Server */}
      <Card padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerIcon className="w-4 h-4 text-primary" /> Log Server — Awal
            &amp; Akhir Shift
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SERVER_FASES.map((f) => (
            <ServerFaseForm
              key={f}
              fase={f}
              tanggal={tanggal}
              existing={serverByFase(f)}
              onSaved={bump}
            />
          ))}
        </div>
      </Card>

      {/* Ringkasan */}
      <Ringkasan
        initialTanggal={tanggal}
        initialShift={shift}
        refreshKey={refreshKey}
      />
    </div>
  );
}
