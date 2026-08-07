import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listCatatanSupervisiForOwner } from "@/lib/shiftReportQueries";

export const dynamic = "force-dynamic";

/** GET /api/catatan-supervisi?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "user") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const fromStr = sp.get("from");
  const toStr = sp.get("to");
  const from = fromStr ? new Date(`${fromStr}T00:00:00+07:00`) : null;
  const to = toStr ? new Date(`${toStr}T23:59:59+07:00`) : null;

  const items = await listCatatanSupervisiForOwner(session.sub, { from, to });
  return NextResponse.json({ items });
}
