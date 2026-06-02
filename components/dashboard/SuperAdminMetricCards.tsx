"use client";

import { motion } from "framer-motion";
import {
  Layers,
  CreditCard,
  Network,
  CheckCircle2,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CountUp } from "./CountUp";
import type { SuperAdminDashboardData } from "@/lib/dashboardQueries";

interface Props {
  counts: SuperAdminDashboardData["counts"];
}

export function SuperAdminMetricCards({ counts }: Props) {
  const cards = [
    {
      label: "Total Tiket Open",
      value: counts.openTotal,
      unit: "tiket",
      Icon: Layers,
      ring: "bg-primary-50 text-primary",
      bar: "bg-primary",
      accent: "text-primary",
    },
    {
      label: "Open Tiket ATM",
      value: counts.openAtm,
      unit: "tiket",
      Icon: CreditCard,
      ring: "bg-blue-100 text-blue-700",
      bar: "bg-blue-500",
      accent: "text-blue-700",
    },
    {
      label: "Open Tiket Jaringan",
      value: counts.openJaringan,
      unit: "tiket",
      Icon: Network,
      ring: "bg-accent/10 text-accent-dark",
      bar: "bg-accent",
      accent: "text-accent-dark",
    },
    {
      label: "Selesai Hari Ini",
      value: counts.selesaiHariIni,
      unit: "tiket",
      Icon: CheckCircle2,
      ring: "bg-green-100 text-green-700",
      bar: "bg-green-500",
      accent: "text-green-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.06 }}
        >
          <Card padding="lg" className="relative overflow-hidden h-full">
            <span className={`absolute left-0 top-0 h-full w-1 ${c.bar}`} aria-hidden />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{c.label}</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <CountUp
                    value={c.value}
                    className={`text-3xl font-display font-bold ${c.accent}`}
                  />
                  <span className="text-xs text-gray-400">{c.unit}</span>
                </div>
              </div>
              <span className={`grid place-items-center w-10 h-10 rounded-xl ${c.ring}`}>
                <c.Icon className="w-5 h-5" />
              </span>
            </div>
          </Card>
        </motion.div>
      ))}

      {/* Kartu Member Aktif — dua angka (User | Supervisi). */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card padding="lg" className="relative overflow-hidden h-full">
          <span className="absolute left-0 top-0 h-full w-1 bg-gray-400" aria-hidden />
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-gray-500">Member Aktif</p>
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-gray-100 text-gray-600">
              <Users className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="leading-tight">
              <CountUp value={counts.memberUser} className="text-2xl font-display font-bold text-gray-800" />
              <span className="block text-[11px] text-gray-500">User</span>
            </div>
            <div className="leading-tight">
              <CountUp value={counts.memberSupervisi} className="text-2xl font-display font-bold text-gray-800" />
              <span className="block text-[11px] text-gray-500">Supervisi</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
