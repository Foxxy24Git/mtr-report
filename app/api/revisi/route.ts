import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listOpenRevisionsForUser } from "@/lib/activityRevision";

/**
 * GET /api/revisi — kotak masuk menu "Revisi" petugas (lihat
 * {@link listOpenRevisionsForUser} untuk kriteria lengkap).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const items = await listOpenRevisionsForUser(session.sub);
  return NextResponse.json({ items });
}
