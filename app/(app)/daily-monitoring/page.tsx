import { requireSession } from "@/lib/session";
import { listTickets } from "@/lib/ticketQueries";
import { ALL_SHIFTS } from "@/lib/shift";
import { DailyMonitoringClient } from "@/components/daily-monitoring/DailyMonitoringClient";

export const dynamic = "force-dynamic";

export default async function DailyMonitoringPage() {
  const session = await requireSession();
  const items = await listTickets({ currentUserId: session.sub });

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Daily Monitoring</h1>
        <p className="page-subtitle">
          Tracking seluruh tiket gangguan ATM &amp; jaringan. Klik baris untuk
          membuka detail &amp; mencatat kegiatan penanganan.
        </p>
      </div>
      <DailyMonitoringClient initialItems={items} shifts={ALL_SHIFTS} />
    </div>
  );
}
