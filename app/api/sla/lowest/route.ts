import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, parseSlaBasis, getLowestSla } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/lowest?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&kategori=atm|jaringan|semua&basis=internal|eksternal
 * ATM/jaringan dengan SLA periode terendah (limit 20). Lihat lib/slaMonitoring.ts.
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
  const data = await getLowestSla(parsed.filter, parsedBasis.basis);
  return NextResponse.json(data);
}
