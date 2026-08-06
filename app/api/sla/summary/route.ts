import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, parseSlaBasis, getSlaSummary } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/summary?dari=&sampai=&kategori=&basis=internal|eksternal
 * Ringkasan umum SLA: total tiket, rata-rata SLA, total downtime, jumlah ATM &
 * jaringan bermasalah, serta rata-rata SLA per kategori.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const parsed = parseSlaFilters(sp);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const parsedBasis = parseSlaBasis(sp);
  if (!parsedBasis.ok) {
    return NextResponse.json({ error: parsedBasis.error }, { status: 400 });
  }
  const data = await getSlaSummary(parsed.filter, parsedBasis.basis);
  return NextResponse.json(data);
}
