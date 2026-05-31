import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupervisiDashboardData } from "@/lib/dashboardQueries";

/**
 * GET /api/dashboard/supervisi — data agregat Dashboard Supervisi (PRD revisi
 * §4.A): tiket belum approve milik supervisi yang login. Dipakai tombol
 * Refresh & auto-refresh pada Dashboard Supervisi.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "supervisi") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const data = await getSupervisiDashboardData(session.sub);
  return NextResponse.json(data);
}
