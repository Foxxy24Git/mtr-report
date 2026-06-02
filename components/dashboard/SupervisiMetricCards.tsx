"use client";

import { motion } from "framer-motion";
import { FileClock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { CountUp } from "./CountUp";

interface Props {
  pendingCount: number;
}

/**
 * Kartu metrik Dashboard Supervisi (PART 5): jumlah LAPORAN SHIFT yang belum
 * di-approve. Highlight merah saat ada laporan tertunda.
 */
export function SupervisiMetricCards({ pendingCount }: Props) {
  const alert = pendingCount > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        padding="lg"
        className={cn(
          "relative overflow-hidden",
          alert && "ring-1 ring-red-200 bg-red-50/40"
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-0 h-full w-1",
            alert ? "bg-red-500" : "bg-emerald-500"
          )}
          aria-hidden
        />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Laporan Shift Belum Diapprove
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <CountUp
                value={pendingCount}
                className={cn(
                  "text-4xl font-display font-bold",
                  alert ? "text-red-600" : "text-emerald-600"
                )}
              />
              <span className="text-sm text-gray-400">laporan</span>
            </div>
          </div>
          <span
            className={cn(
              "grid place-items-center w-11 h-11 rounded-xl",
              alert ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-600"
            )}
          >
            {alert ? (
              <FileClock className="w-6 h-6" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
          </span>
        </div>
        <p
          className={cn(
            "mt-3 text-xs font-medium",
            alert ? "text-red-600" : "text-emerald-600"
          )}
        >
          {alert
            ? "Menunggu persetujuan Anda"
            : "Tidak ada laporan shift tertunda"}
        </p>
      </Card>
    </motion.div>
  );
}
