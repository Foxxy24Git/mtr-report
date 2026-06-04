import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, getByJenisGangguan } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/by-jenis-gangguan?dari=&sampai=&kategori=
 * Pengelompokan tiket per jenis gangguan (COUNT + persentase).
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
  const data = await getByJenisGangguan(parsed.filter);
  return NextResponse.json(data);
}
