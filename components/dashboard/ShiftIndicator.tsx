"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { ALL_SHIFTS, type ShiftCode } from "@/lib/shift";

const SHIFT_JAM: Record<ShiftCode, string> = {
  A: "07–15",
  B: "15–23",
  C: "23–07",
  D: "07–19",
  E: "19–07",
};

interface Props {
  perShift: Record<string, number>;
  currentShift?: string;
}

export function ShiftIndicator({ perShift, currentShift }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {ALL_SHIFTS.map((s, i) => {
        const count = perShift[s] ?? 0;
        const active = s === currentShift;
        return (
          <motion.div
            key={s}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className={cn(
              "rounded-lg border px-2 py-3 text-center transition-colors",
              active
                ? "border-accent bg-accent/10"
                : "border-gray-100 bg-surface-muted"
            )}
            title={active ? "Shift Anda saat ini" : undefined}
          >
            <div
              className={cn(
                "text-xs font-semibold",
                active ? "text-accent-dark" : "text-gray-500"
              )}
            >
              Shift {s}
            </div>
            <div className="text-[10px] text-gray-400">{SHIFT_JAM[s]}</div>
            <div
              className={cn(
                "mt-1 text-2xl font-display font-bold",
                count > 0 ? "text-gray-900" : "text-gray-300"
              )}
            >
              {count}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
