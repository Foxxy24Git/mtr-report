import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * POST /api/telegram/test — uji koneksi bot Telegram.
 * Body: { chatId }. Hanya Super Admin (PRD §2).
 * Mengirim pesan konfirmasi ke chatId yang diberikan.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const chatId =
    typeof body?.chatId === "string" || typeof body?.chatId === "number"
      ? body.chatId
      : null;
  if (chatId === null || chatId === "") {
    return NextResponse.json({ error: "chatId wajib diisi." }, { status: 400 });
  }

  const result = await sendTelegramMessage(
    chatId,
    "✅ Koneksi Telegram mtr-Report berhasil!"
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Gagal mengirim pesan Telegram.", detail: result },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
