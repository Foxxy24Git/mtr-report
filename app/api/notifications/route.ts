import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listAndMarkReadNotifications } from "@/lib/notifications";

/**
 * GET /api/notifications — daftar notifikasi lonceng Topbar (terbaru dulu).
 * Side effect: menandai semua notifikasi yang cocok sebagai sudah dibaca,
 * jadi badge angka reset ke 0 begitu lonceng dibuka (bukan endpoint
 * read-only — polling badge pakai /api/notifications/count, bukan ini).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const items = await listAndMarkReadNotifications(session);
  return NextResponse.json({ items });
}
