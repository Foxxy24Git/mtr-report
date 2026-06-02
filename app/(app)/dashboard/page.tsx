import { requireSession } from "@/lib/session";
import {
  getDashboardData,
  getSupervisiDashboardData,
  getSuperAdminDashboardData,
} from "@/lib/dashboardQueries";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { SupervisiDashboardClient } from "@/components/dashboard/SupervisiDashboardClient";
import { SuperAdminDashboardClient } from "@/components/dashboard/SuperAdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();

  // Routing per role (PRD §1): superadmin → Dashboard Super Admin (metrik
  // global, tiket realtime, member). supervisi → Dashboard Supervisi. user →
  // Dashboard User.
  if (session.role === "superadmin") {
    const data = await getSuperAdminDashboardData();
    return (
      <div>
        <div className="mb-6">
          <h1 className="page-title">Dashboard Super Admin</h1>
          <p className="page-subtitle">
            Pantau seluruh tiket open realtime, ringkasan metrik, member, dan
            kalender tiket lintas petugas.
          </p>
        </div>
        <SuperAdminDashboardClient initialData={data} />
      </div>
    );
  }

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
