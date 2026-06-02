import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listTables } from "@/lib/dbStudio";

/**
 * GET /api/superadmin/db — daftar tabel yang boleh diakses Database Studio.
 * Hanya Super Admin (PRD §3).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }
  return NextResponse.json({ tables: listTables() });
}
