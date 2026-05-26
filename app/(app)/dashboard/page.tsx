import { requireSession } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboardQueries";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const data = await getDashboardData(session.sub);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Ringkasan open tiket ATM &amp; jaringan, kalender tiket berjalan, dan
          alert realtime.
        </p>
      </div>
      <DashboardClient initialData={data} currentShift={session.shift} />
    </div>
  );
}
