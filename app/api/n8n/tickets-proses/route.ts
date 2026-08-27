import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/n8n/tickets-proses — dipanggil dari n8n (bukan sesi user biasa),
 * dipicu perintah "#list" di grup WA. Diproteksi header `x-webhook-secret`
 * yang sama dengan webhook notif tiket (lib/n8nNotif.ts), bukan sesi login.
 * Balikan teks siap-kirim supaya node n8n tinggal teruskan ke WAHA tanpa
 * perlu logic loop/join di sisi n8n.
 */
export async function GET(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.N8N_TICKET_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { status: TicketStatus.proses },
    orderBy: { waktuOpen: "asc" },
    select: {
      noTiket: true,
      atm: { select: { kodeAtm: true, namaAtm: true } },
    },
  });

  if (tickets.length === 0) {
    return NextResponse.json({
      count: 0,
      text: "✅ Tidak ada tiket yang masih proses saat ini.",
    });
  }

  const baris = tickets.map(
    (t, i) =>
      `${i + 1}. ${t.noTiket} | ${t.atm?.kodeAtm ?? "-"} - ${t.atm?.namaAtm ?? "-"}`
  );
  const text = `🗂 *DAFTAR TIKET PROSES* (${tickets.length})\n\n${baris.join("\n")}`;

  return NextResponse.json({ count: tickets.length, text });
}
