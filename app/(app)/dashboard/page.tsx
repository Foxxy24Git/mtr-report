import { requireSession } from "@/lib/session";
import {
  getDashboardData,
  getSupervisiDashboardData,
} from "@/lib/dashboardQueries";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { SupervisiDashboardClient } from "@/components/dashboard/SupervisiDashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();

  // Routing per role (PRD revisi §4.1/§4.2): supervisi → Dashboard Supervisi
  // (tanpa selector shift). User & superadmin → Dashboard User.
  if (session.role === "supervisi") {
    const data = await getSupervisiDashboardData(session.sub);
    return (
      <div>
        <div className="mb-6">
          <h1 className="page-title">Dashboard Supervisi</h1>
          <p className="page-subtitle">
            Tiket gangguan ATM &amp; jaringan yang menunggu persetujuan Anda,
            beserta kalender tiket tertunda.
          </p>
        </div>
        <SupervisiDashboardClient initialData={data} />
      </div>
    );
  }

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
