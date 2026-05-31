import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { countWeeklyTickets, listWeeklyTickets } from "@/lib/ticketQueries";
import { resolveRange } from "@/lib/weeklyRange";
import { ALL_SHIFTS } from "@/lib/shift";
import { WeeklyMonitoringClient } from "@/components/weekly-monitoring/WeeklyMonitoringClient";

export const dynamic = "force-dynamic";

export default async function WeeklyMonitoringPage() {
  await requireSession();

  // Rentang default 7 hari (rolling) untuk muat awal.
  const { from, to, fromKey, toKey } = resolveRange(null, null);

  const [items, total, picUsers, atmRows, vendorRows] = await Promise.all([
    listWeeklyTickets({ from, to }),
    countWeeklyTickets({ from, to }),
    prisma.user.findMany({
      where: { role: "user" },
      orderBy: { username: "asc" },
      select: { id: true, username: true, nama: true },
    }),
    // Master ATM untuk filter/autocomplete "Kode/Lokasi ATM" (track 1 ATM).
    prisma.atmMaster.findMany({
      orderBy: { kodeAtm: "asc" },
      select: { id: true, kodeAtm: true, namaAtm: true },
    }),
    // Daftar vendor yang pernah muncul di data tiket untuk dropdown filter.
    prisma.ticket.findMany({
      where: { vendor: { not: null } },
      distinct: ["vendor"],
      orderBy: { vendor: "asc" },
      select: { vendor: true },
    }),
  ]);

  const vendorOptions = vendorRows
    .map((v) => v.vendor?.trim() ?? "")
    .filter((v) => v.length > 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Weekly Monitoring</h1>
        <p className="page-subtitle">
          Cari &amp; telusuri riwayat seluruh tiket gangguan ATM &amp; jaringan
          (lintas user &amp; shift, proses maupun selesai). Default 7 hari
          terakhir — perluas rentang untuk melacak permasalahan satu ATM. Klik
          baris untuk melihat detail &amp; kronologi (read-only).
        </p>
      </div>
      <WeeklyMonitoringClient
        initialItems={items}
        initialTotal={total}
        initialFrom={fromKey}
        initialTo={toKey}
        shifts={ALL_SHIFTS}
        picUsers={picUsers}
        atmOptions={atmRows}
        vendorOptions={vendorOptions}
      />
    </div>
  );
}
