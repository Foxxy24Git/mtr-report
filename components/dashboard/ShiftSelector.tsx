"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, AlertCircle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { SHIFT_LABELS } from "@/lib/constants";
import { ALL_SHIFTS, validShiftsForDate, type ShiftCode } from "@/lib/shift";

interface Props {
  currentShift?: string;
}

export function ShiftSelector({ currentShift }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<ShiftCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const validShifts = useMemo(() => validShiftsForDate(today), [today]);
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
    setError(null);
    setSaving(s);
    try {
      const res = await fetch("/api/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift: s }),
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
          const valid = validShifts.includes(s);
          const active = s === currentShift;
          return (
            <button
              key={s}
              type="button"
              disabled={!valid || saving !== null}
              onClick={() => pick(s)}
              aria-pressed={active}
              title={
                valid
                  ? SHIFT_LABELS[s]
                  : `${SHIFT_LABELS[s]} — tidak berlaku hari ini`
              }
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border py-3 px-1 transition-all",
                active
                  ? "border-primary bg-primary-50 ring-2 ring-primary/30"
                  : valid
                    ? "border-gray-300 hover:border-primary/50 hover:bg-surface-subtle"
                    : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
              )}
            >
              {active && (
                <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-primary" />
              )}
              <span
                className={cn(
                  "text-lg font-bold",
                  active ? "text-primary" : "text-gray-700"
                )}
              >
                {s}
              </span>
              <span className="text-[10px] text-gray-500 leading-tight mt-0.5">
                {SHIFT_LABELS[s].match(/\(([^)]+)\)/)?.[1]}
              </span>
            </button>
          );
        })}
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
            Belum memilih shift. Shift yang berlaku hari ini:{" "}
            {validShifts.join(", ")}.
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
