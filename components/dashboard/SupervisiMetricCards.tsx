"use client";

import { motion } from "framer-motion";
import { CreditCard, Network, Layers, CheckCircle2, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { CountUp } from "./CountUp";

interface Props {
  pending: { atm: number; jaringan: number; total: number };
}

const cards: { key: "atm" | "jaringan" | "total"; label: string; Icon: LucideIcon }[] = [
  { key: "atm", label: "Tiket ATM Belum Approve", Icon: CreditCard },
  { key: "jaringan", label: "Tiket Jaringan Belum Approve", Icon: Network },
  { key: "total", label: "Total Tiket Tertunda", Icon: Layers },
];

/**
 * Kartu metrik Dashboard Supervisi (PRD revisi §4.A): jumlah tiket belum
 * approve per kategori + total. Highlight merah saat ada tiket tertunda.
 */
export function SupervisiMetricCards({ pending }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((c, i) => {
        const value = pending[c.key];
        const alert = value > 0;
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
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
                  <p className="text-sm font-medium text-gray-500">{c.label}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <CountUp
                      value={value}
                      className={cn(
                        "text-4xl font-display font-bold",
                        alert ? "text-red-600" : "text-emerald-600"
                      )}
                    />
                    <span className="text-sm text-gray-400">tiket</span>
                  </div>
                </div>
                <span
                  className={cn(
                    "grid place-items-center w-11 h-11 rounded-xl",
                    alert ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-600"
                  )}
                >
                  {alert ? <c.Icon className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                </span>
              </div>
              <p
                className={cn(
                  "mt-3 text-xs font-medium",
                  alert ? "text-red-600" : "text-emerald-600"
                )}
              >
                {alert ? "Menunggu persetujuan Anda" : "Tidak ada tiket tertunda"}
              </p>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
