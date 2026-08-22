"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, AlertCircle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { SHIFT_LABELS, SHIFT_NAMES } from "@/lib/constants";
import { ALL_SHIFTS, validShiftsForDate, type ShiftCode } from "@/lib/shift";

interface Props {
  currentShift?: string;
  currentSupervisiId?: string;
  supervisiUsers?: { id: string; nama: string }[];
  /** True bila Super Admin sudah mengaktifkan mode shift 12 jam untuk hari ini. */
  shift12JamAktifHariIni?: boolean;
}

export function ShiftSelector({
  currentShift,
  currentSupervisiId,
  supervisiUsers = [],
  shift12JamAktifHariIni = false,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<ShiftCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supervisiId, setSupervisiId] = useState(currentSupervisiId ?? "");
  const [savingSupervisi, setSavingSupervisi] = useState(false);
  const [supervisiErr, setSupervisiErr] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const validShifts = useMemo(
    () => validShiftsForDate(today, shift12JamAktifHariIni),
    [today, shift12JamAktifHariIni]
  );
  const hariIni = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(today),
    [today]
  );

  async function pick(s: ShiftCode) {
    if (saving || s === currentShift) return;
    if (!validShifts.includes(s)) {
      setError(
        s === "D" || s === "E"
          ? "Shift 12 jam belum diaktifkan untuk hari ini. Hubungi Super Admin bila diperlukan."
          : "Shift ini tidak tersedia untuk hari ini."
      );
      return;
    }
    if (!supervisiId) {
      setError("Pilih Supervisi terlebih dahulu sebelum memilih shift.");
      return;
    }
    setError(null);
    setSaving(s);
    try {
      const res = await fetch("/api/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift: s, supervisiId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan shift.");
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setSaving(null);
    }
  }

  /**
   * Ganti Supervisi tanpa mengganti shift. Kalau shift belum aktif, cukup
   * simpan di state lokal — dikirim bareng saat petugas klik salah satu
   * tombol shift (lihat pick() di atas).
   */
  async function changeSupervisi(id: string) {
    setSupervisiId(id);
    setSupervisiErr(null);
    if (!currentShift || !id) return;
    setSavingSupervisi(true);
    try {
      const res = await fetch("/api/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift: currentShift, supervisiId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupervisiErr(data.error ?? "Gagal menyimpan supervisi.");
        return;
      }
      router.refresh();
    } catch {
      setSupervisiErr("Tidak dapat terhubung ke server.");
    } finally {
      setSavingSupervisi(false);
    }
  }

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" />
          Shift Aktif
        </CardTitle>
        <span className="text-xs text-gray-400 capitalize">{hariIni}</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {ALL_SHIFTS.map((s) => {
          const active = s === currentShift;
          // Sesi yang sedang berjalan (active) tetap ditampilkan apa adanya
          // meski aturan hari ini berubah di tengah sesi (mis. shift E lewat
          // tengah malam) — lihat catatan "lanjutan" di app/api/shift/route.ts.
          const valid = active || validShifts.includes(s);
          return (
            <button
              key={s}
              type="button"
              disabled={saving !== null || !valid}
              onClick={() => pick(s)}
              aria-pressed={active}
              title={
                valid
                  ? SHIFT_LABELS[s]
                  : `${SHIFT_LABELS[s]} — belum tersedia untuk hari ini. Hubungi Super Admin bila perlu shift 12 jam di hari kerja.`
              }
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border py-3 px-1 transition-all",
                active
                  ? "border-primary bg-primary-50 ring-2 ring-primary/30"
                  : valid
                    ? "border-gray-300 hover:border-primary/50 hover:bg-surface-subtle"
                    : "border-gray-200 opacity-40 cursor-not-allowed"
              )}
            >
              {active && (
                <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-primary" />
              )}
              <span
                className={cn(
                  "text-sm font-bold leading-tight text-center",
                  active ? "text-primary" : "text-gray-700"
                )}
              >
                {SHIFT_NAMES[s]}
              </span>
              <span className="text-[10px] text-gray-500 leading-tight mt-0.5">
                {SHIFT_LABELS[s].match(/\(([^)]+)\)/)?.[1]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <Select
          label="Supervisi Bertugas"
          value={supervisiId}
          disabled={savingSupervisi}
          onChange={(e) => changeSupervisi(e.target.value)}
        >
          <option value="">— Pilih supervisi —</option>
          {supervisiUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nama}
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-400 mt-1">
          Supervisi yang dipilih dapat menambah kegiatan pengawasan pada tiket
          yang dibuka selama shift ini — tidak ikut ke laporan yang di-download.
        </p>
        {supervisiErr && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{supervisiErr}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        {currentShift && SHIFT_LABELS[currentShift] ? (
          <>
            Shift aktif:{" "}
            <span className="font-medium text-gray-600">
              {SHIFT_LABELS[currentShift]}
            </span>
            . Dipakai untuk open tiket, daily monitoring, dan suhu/log server.
          </>
        ) : (
          <>
            Belum memilih shift. Hari kerja: Shift Pagi/Sore/Malam (8 jam).
            {shift12JamAktifHariIni
              ? " Shift 12 jam sedang diaktifkan Super Admin untuk hari ini."
              : " Shift 12 jam (D/E) khusus akhir pekan, kecuali diaktifkan Super Admin."}
          </>
        )}
      </p>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </Card>
  );
}
