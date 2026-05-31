import { NextResponse } from "next/server";
import { CpTipe, ShiftKode, TicketKategori } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateUniqueNoTiket } from "@/lib/noTiket";
import { listTickets } from "@/lib/ticketQueries";

const KATEGORI = Object.values(TicketKategori) as string[];
const SHIFTS = Object.values(ShiftKode) as string[];

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optStr(v: unknown): string | null {
  const s = cleanStr(v);
  return s.length ? s : null;
}

/**
 * GET /api/tickets — daftar tiket untuk Daily Monitoring (PRD §4.B).
 * Filter query: kategori (atm|jaringan), shift (A–E),
 * scope (mine|lanjutan|all), status (proses|selesai|all),
 * dailyMonitoring=1 (aktifkan filter ketat shift aktif sesuai PRD §4.B).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const dailyMonitoring = sp.get("dailyMonitoring") === "1";
  const items = await listTickets({
    kategori: sp.get("kategori"),
    shift: sp.get("shift"),
    scope: sp.get("scope"),
    status: sp.get("status"),
    statusSupervisi: sp.get("statusSupervisi"),
    currentUserId: session.sub,
    // Supervisi terikat: hanya tiket dengan supervisiId = dirinya (PRD revisi
    // §4). Superadmin & user lain tidak dibatasi field ini.
    supervisiId: session.role === "supervisi" ? session.sub : null,
    dailyMonitoring,
    currentShift: dailyMonitoring ? session.shift : null,
    shiftStartedAt: dailyMonitoring ? session.shiftStartedAt : null,
  });

  return NextResponse.json({ items });
}

/** POST /api/tickets — buka tiket gangguan baru (PRD §4.C). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  if (session.role === "supervisi") {
    return NextResponse.json(
      { error: "Supervisi tidak dapat membuka tiket." },
      { status: 403 }
    );
  }
  if (!SHIFTS.includes(session.shift)) {
    return NextResponse.json(
      { error: "Shift sesi tidak valid. Silakan login ulang." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);

  // --- Kategori ---
  const kategori = cleanStr(body?.kategori);
  if (!KATEGORI.includes(kategori)) {
    return NextResponse.json(
      { error: "Kategori tiket wajib dipilih (ATM atau Jaringan)." },
      { status: 400 }
    );
  }

  // --- Lokasi/ATM ---
  const atmId = cleanStr(body?.atmId);
  if (!atmId) {
    return NextResponse.json(
      { error: "ATM/lokasi wajib dipilih dari pencarian." },
      { status: 400 }
    );
  }
  const atm = await prisma.atmMaster.findUnique({ where: { id: atmId } });
  if (!atm) {
    return NextResponse.json(
      { error: "ATM/lokasi tidak ditemukan di master." },
      { status: 400 }
    );
  }

  // --- Contact Person ---
  const cpTipe = cleanStr(body?.cpTipe);
  if (!(Object.values(CpTipe) as string[]).includes(cpTipe)) {
    return NextResponse.json(
      { error: "Contact Person wajib dipilih (No PIC atau WAG)." },
      { status: 400 }
    );
  }
  let cpNama: string | null = null;
  let cpTelp: string | null = null;
  if (cpTipe === CpTipe.pic) {
    cpNama = optStr(body?.cpNama);
    cpTelp = optStr(body?.cpTelp);
    if (!cpNama || !cpTelp) {
      return NextResponse.json(
        { error: "No PIC wajib mengisi nama dan nomor telepon." },
        { status: 400 }
      );
    }
  } else {
    // WAG → simpan nama grup WhatsApp.
    cpNama = optStr(body?.cpNama);
    if (!cpNama) {
      return NextResponse.json(
        { error: "Nama WAG (WhatsApp Group) wajib diisi." },
        { status: 400 }
      );
    }
  }

  // --- Dropdown master (wajib) ---
  const jenisGangguan = optStr(body?.jenisGangguan);
  const sumberPenyebab = optStr(body?.sumberPenyebab);
  const metodePenanganan = optStr(body?.metodePenanganan);
  if (!jenisGangguan || !sumberPenyebab || !metodePenanganan) {
    return NextResponse.json(
      {
        error:
          "Jenis Gangguan, Sumber Penyebab, dan Metode Penanganan wajib dipilih.",
      },
      { status: 400 }
    );
  }

  // --- Kegiatan pertama (WAJIB) ---
  const kegiatan = cleanStr(body?.kegiatan);
  if (!kegiatan) {
    return NextResponse.json(
      { error: "Kegiatan penanganan pertama wajib diisi." },
      { status: 400 }
    );
  }

  const noTiket = await generateUniqueNoTiket(prisma);
  const shiftKode = session.shift as ShiftKode;

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        noTiket,
        kategori: kategori as TicketKategori,
        atmId: atm.id,
        cpTipe: cpTipe as CpTipe,
        cpNama,
        cpTelp,
        jenisGangguan,
        sumberPenyebab,
        metodePenanganan,
        vendor: optStr(body?.vendor),
        noTiketVendor: optStr(body?.noTiketVendor),
        shiftKode,
        // Shift asal = shift saat open; immutable, dipakai untuk laporan.
        openShiftKode: shiftKode,
        ownerUserId: session.sub,
      },
    });

    await tx.ticketActivity.create({
      data: {
        ticketId: t.id,
        userId: session.sub,
        shiftKode,
        teks: kegiatan,
      },
    });

    return t;
  });

  return NextResponse.json(
    { item: { id: ticket.id, noTiket: ticket.noTiket } },
    { status: 201 }
  );
}
