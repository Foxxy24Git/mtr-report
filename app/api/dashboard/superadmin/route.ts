import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSuperAdminDashboardData } from "@/lib/dashboardQueries";

/**
 * GET /api/dashboard/superadmin — data agregat Dashboard Super Admin (PRD §1):
 * metrik global, tabel tiket open semua user, tabel member. Dipakai auto-refresh
 * 1 menit pada Dashboard Super Admin.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const data = await getSuperAdminDashboardData();
  return NextResponse.json(data);
}
