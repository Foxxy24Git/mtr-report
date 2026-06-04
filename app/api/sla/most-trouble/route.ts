import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, getMostTrouble } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/most-trouble?dari=&sampai=&kategori=
 * ATM/jaringan paling sering bermasalah (COUNT semua tiket, limit 20).
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
  const data = await getMostTrouble(parsed.filter);
  return NextResponse.json(data);
}
