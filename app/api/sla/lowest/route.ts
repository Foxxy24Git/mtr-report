import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, getLowestSla } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/lowest?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&kategori=atm|jaringan|semua
 * ATM/jaringan dengan SLA periode terendah (limit 20). Lihat lib/slaMonitoring.ts.
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
  const data = await getLowestSla(parsed.filter);
  return NextResponse.json(data);
}
