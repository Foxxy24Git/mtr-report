import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboardQueries";

/**
 * GET /api/dashboard — data agregat dashboard (PRD §4.A).
 * Dipakai untuk auto-refresh status open tiap 1 jam & refresh manual.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const data = await getDashboardData(session.sub);
  return NextResponse.json(data);
}
