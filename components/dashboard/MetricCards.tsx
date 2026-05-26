"use client";

import { motion } from "framer-motion";
import { CreditCard, Network, User2, ArrowRightLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CountUp } from "./CountUp";
import type { KategoriCount } from "@/lib/dashboardQueries";

interface Props {
  atm: KategoriCount;
  jaringan: KategoriCount;
}

const cards = [
  {
    key: "atm" as const,
    label: "Open Tiket ATM",
    Icon: CreditCard,
    accent: "text-primary",
    ring: "bg-primary-50 text-primary",
    bar: "bg-primary",
  },
  {
    key: "jaringan" as const,
    label: "Open Tiket Jaringan Kantor",
    Icon: Network,
    accent: "text-accent-dark",
    ring: "bg-accent/10 text-accent-dark",
    bar: "bg-accent",
  },
];

export function MetricCards({ atm, jaringan }: Props) {
  const data = { atm, jaringan };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((c, i) => {
        const d = data[c.key];
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
          >
            <Card padding="lg" className="relative overflow-hidden">
              <span
                className={`absolute left-0 top-0 h-full w-1 ${c.bar}`}
                aria-hidden
              />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{c.label}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <CountUp
                      value={d.total}
                      className={`text-4xl font-display font-bold ${c.accent}`}
                    />
                    <span className="text-sm text-gray-400">tiket</span>
                  </div>
                </div>
                <span className={`grid place-items-center w-11 h-11 rounded-xl ${c.ring}`}>
                  <c.Icon className="w-6 h-6" />
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <SubFigure
                  Icon={User2}
                  label="Milik shift ini"
                  value={d.mine}
                  tone="bg-gray-100 text-gray-700"
                />
                <SubFigure
                  Icon={ArrowRightLeft}
                  label="Lanjutan"
                  value={d.lanjutan}
                  tone="bg-amber-100 text-amber-800"
                />
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function SubFigure({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: typeof User2;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-muted px-3 py-2">
      <span className={`grid place-items-center w-7 h-7 rounded-md ${tone}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="leading-tight">
        <span className="block text-base font-semibold text-gray-900">
          {value}
        </span>
        <span className="block text-[11px] text-gray-500">{label}</span>
      </div>
    </div>
  );
}
