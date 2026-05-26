"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDateKey } from "@/lib/format";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface Props {
  /** Kunci tanggal (YYYY-MM-DD) yang punya tiket masih proses. */
  markedDates: Set<string>;
  selected: string | null;
  onSelect: (key: string) => void;
}

export function MiniCalendar({ markedDates, selected, onSelect }: Props) {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const todayKey = fmtDateKey(now);

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const move = (delta: number) => {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => move(-1)}
          className="p-1.5 rounded-md text-gray-500 hover:bg-surface-subtle hover:text-gray-900 transition-colors"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900">
          {BULAN[view.m]} {view.y}
        </span>
        <button
          onClick={() => move(1)}
          className="p-1.5 rounded-md text-gray-500 hover:bg-surface-subtle hover:text-gray-900 transition-colors"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {HARI.map((h) => (
          <div
            key={h}
            className="text-center text-[11px] font-medium text-gray-400 py-1"
          >
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const key = dateKey(view.y, view.m, d);
          const marked = markedDates.has(key);
          const isSelected = key === selected;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={cn(
                "relative aspect-square rounded-md text-sm transition-colors flex items-center justify-center",
                isSelected
                  ? "bg-primary text-white font-semibold"
                  : isToday
                  ? "bg-primary-50 text-primary font-semibold"
                  : "text-gray-700 hover:bg-surface-subtle"
              )}
            >
              {d}
              {marked && (
                <span
                  className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full",
                    isSelected ? "bg-white" : "bg-accent"
                  )}
                  aria-label="Ada tiket berjalan"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
