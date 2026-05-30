import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listWeeklyTickets } from "@/lib/ticketQueries";
import { resolveRange } from "@/lib/weeklyRange";

/**
 * GET /api/weekly — daftar tiket Weekly Monitoring (menu baru).
 * Query: from, to (YYYY-MM-DD), kategori, status, shift, owner, search.
 * Read-only, lintas user & shift. Semua role login boleh mengakses.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const { from, to, fromKey, toKey } = resolveRange(
    sp.get("from"),
    sp.get("to")
  );

  const items = await listWeeklyTickets({
    from,
    to,
    kategori: sp.get("kategori"),
    status: sp.get("status"),
    shift: sp.get("shift"),
    ownerUserId: sp.get("owner"),
    search: sp.get("search"),
  });

  return NextResponse.json({ items, from: fromKey, to: toKey });
}
