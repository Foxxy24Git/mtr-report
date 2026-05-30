import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listWeeklyTickets } from "@/lib/ticketQueries";
import { resolveRange } from "@/lib/weeklyRange";
import { ALL_SHIFTS } from "@/lib/shift";
import { WeeklyMonitoringClient } from "@/components/weekly-monitoring/WeeklyMonitoringClient";

export const dynamic = "force-dynamic";

export default async function WeeklyMonitoringPage() {
  await requireSession();

  // Rentang default 7 hari (rolling) untuk muat awal.
  const { from, to, fromKey, toKey } = resolveRange(null, null);

  const [items, picUsers] = await Promise.all([
    listWeeklyTickets({ from, to }),
    prisma.user.findMany({
      where: { role: "user" },
      orderBy: { username: "asc" },
      select: { id: true, username: true, nama: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Weekly Monitoring</h1>
        <p className="page-subtitle">
          Riwayat seluruh tiket gangguan ATM &amp; jaringan dalam 7 hari terakhir
          (lintas user &amp; shift, proses maupun selesai). Klik baris untuk
          melihat detail &amp; kronologi (read-only).
        </p>
      </div>
      <WeeklyMonitoringClient
        initialItems={items}
        initialFrom={fromKey}
        initialTo={toKey}
        shifts={ALL_SHIFTS}
        picUsers={picUsers}
      />
    </div>
  );
}
