import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, getSlaSummary } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/summary?dari=&sampai=&kategori=
 * Ringkasan umum SLA: total tiket, rata-rata SLA, total downtime, jumlah ATM &
 * jaringan bermasalah, serta rata-rata SLA per kategori.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const parsed = parseSlaFilters(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const data = await getSlaSummary(parsed.filter);
  return NextResponse.json(data);
}
