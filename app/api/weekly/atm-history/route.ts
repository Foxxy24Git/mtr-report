import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAtmHistory } from "@/lib/ticketQueries";

/**
 * GET /api/weekly/atm-history?atmId=... — ringkasan riwayat satu ATM
 * (PRD revisi §4.7): total tiket sepanjang data, gangguan terbanyak, dan
 * rata-rata SLA. Read-only, semua role login boleh mengakses.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const atmId = new URL(req.url).searchParams.get("atmId");
  if (!atmId) {
    return NextResponse.json({ error: "atmId wajib diisi." }, { status: 400 });
  }

  const history = await getAtmHistory(atmId);
  return NextResponse.json(history);
}
