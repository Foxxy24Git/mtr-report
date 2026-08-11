import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { countUnreadNotifications } from "@/lib/notifications";

/**
 * GET /api/notifications/count — jumlah notifikasi belum dibaca, dipoll
 * berkala oleh Topbar untuk badge lonceng. Read-only (tidak menandai dibaca).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const count = await countUnreadNotifications(session);
  return NextResponse.json({ count });
}
