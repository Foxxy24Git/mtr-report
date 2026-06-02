import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listShiftReports } from "@/lib/shiftReportQueries";

export const dynamic = "force-dynamic";

/**
 * GET /api/shift-reports?status=pending|approved&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Daftar laporan shift untuk menu Supervisi (PART 3). Supervisi melihat laporan
 * miliknya; superadmin (override) melihat semua.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "supervisi" && session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const fromStr = sp.get("from");
  const toStr = sp.get("to");
  const from = fromStr ? new Date(`${fromStr}T00:00:00+07:00`) : null;
  const to = toStr ? new Date(`${toStr}T23:59:59+07:00`) : null;

  const items = await listShiftReports({
    supervisiId: session.role === "supervisi" ? session.sub : null,
    status,
    from,
    to,
  });
  return NextResponse.json({ items });
}
