"use client";

import { useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface ShiftOverrideRow {
  id: string;
  /** YYYY-MM-DD */
  tanggal: string;
  createdByNama: string;
  createdAt: string;
}

function labelTanggal(tanggal: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${tanggal}T00:00:00Z`));
}

export function Shift12JamSection({
  initialItems,
}: {
  initialItems: ShiftOverrideRow[];
}) {
  const [items, setItems] = useState(
    [...initialItems].sort((a, b) => b.tanggal.localeCompare(a.tanggal))
  );
  const [tanggal, setTanggal] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr("");
    if (!tanggal) {
      setAddErr("Tanggal wajib diisi.");
      return;
    }

    setAddBusy(true);
    try {
      const res = await fetch("/api/superadmin/shift-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddErr(data.error ?? "Gagal mengaktifkan shift 12 jam.");
        return;
      }
      setItems((prev) =>
        [data.item as ShiftOverrideRow, ...prev].sort((a, b) =>
          b.tanggal.localeCompare(a.tanggal)
        )
      );
      setTanggal("");
    } finally {
      setAddBusy(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/superadmin/shift-override/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <Card padding="none">
      <div className="p-5 border-b border-gray-100">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" /> Shift 12 Jam — Hari
          Kerja
        </CardTitle>
        <p className="mt-0.5 text-sm text-gray-500">
          Senin–Jumat normalnya hanya shift 8 jam (Pagi/Sore/Malam). Aktifkan
          tanggal tertentu di sini untuk kondisi darurat (petugas sakit/izin,
          atau tanggal merah) — shift 12 jam (Lembur Pagi/Lembur Malam) ikut
          muncul di layar Buka Shift petugas khusus tanggal itu, lalu otomatis
          nonaktif lagi begitu tanggalnya lewat.
        </p>
      </div>

      <form
        onSubmit={submitAdd}
        className="p-5 border-b border-gray-100 bg-surface-muted/30"
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Input
              type="date"
              label="Aktifkan untuk tanggal"
              min={todayKey}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>
          <Button type="submit" loading={addBusy}>
            <Plus className="w-4 h-4" /> Aktifkan
          </Button>
        </div>
        {addErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {addErr}
          </p>
        )}
      </form>

      <ul>
        {items.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-gray-400">
            Belum ada aktivasi shift 12 jam di hari kerja.
          </li>
        )}
        {items.map((row) => (
          <li
            key={row.id}
            className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-center justify-between gap-2.5"
          >
            <div>
              <p className="text-sm text-gray-800 capitalize">
                {labelTanggal(row.tanggal)}
              </p>
              <p className="text-xs text-gray-400">
                Diaktifkan oleh {row.createdByNama}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={deletingId === row.id}
              onClick={() => remove(row.id)}
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
