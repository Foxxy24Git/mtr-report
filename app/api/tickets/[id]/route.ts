import { NextResponse } from "next/server";
import { CpTipe, Prisma, TicketKategori, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { getTicketDetail } from "@/lib/ticketQueries";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const KATEGORI = Object.values(TicketKategori) as string[];
const CP_TIPE = Object.values(CpTipe) as string[];

/**
 * Field yang HANYA boleh diubah Super Admin (override human error).
 * Petugas/shift holder tetap terbatas pada klasifikasi gangguan & vendor.
 */
const SUPERADMIN_FIELDS = [
  "kategori",
  "atmId",
  "cpTipe",
  "cpNama",
  "cpTelp",
  "waktuOpen",
] as const;

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: unknown): string | null {
  const s = cleanStr(v);
  return s.length ? s : null;
}
function hasField(body: unknown, key: string): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>)[key] !== undefined
  );
}

/** GET /api/tickets/[id] — detail tiket + kronologi kegiatan + handover. */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;

  const ticket = await getTicketDetail(id);
  if (!ticket) {
    return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ item: ticket });
}

/**
 * PATCH /api/tickets/[id] — ubah field gangguan & pimpinan (PRD §4.B).
 *
 * Dua tingkat izin:
 * - Semua yang lolos guardTicketMutation (pemilik / petugas shift pemegang /
 *   Super Admin): klasifikasi gangguan, vendor, keterangan.
 * - Super Admin SAJA: kategori, ATM/lokasi, contact person, waktu kejadian.
 *   Dicek di server (session.role), bukan sekadar disembunyikan di form.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  const isSuperadmin = session.role === "superadmin";

  const noTiketVendorBaru = optStr(body?.noTiketVendor);
  const data: Prisma.TicketUncheckedUpdateInput = {
    jenisGangguan: optStr(body?.jenisGangguan),
    sumberPenyebab: optStr(body?.sumberPenyebab),
    metodePenanganan: optStr(body?.metodePenanganan),
    vendor: optStr(body?.vendor),
    noTiketVendor: noTiketVendorBaru,
    keterangan: optStr(body?.keterangan),
  };

  // Dasar SLA Eksternal (Lampiran IV PKS Artajasa) — dicatat sekali saja
  // saat No Tiket Vendor pertama kali diisi, immutable sesudahnya. Pola
  // sama seperti waktuResponInternal di
  // app/api/tickets/[id]/activities/route.ts:74-78. Prioritas: waktu
  // manual dari petugas kalau diisi & valid, else now().
  const perluCatatWaktu =
    !guard.ticket.waktuLaporVendor &&
    !guard.ticket.noTiketVendor &&
    noTiketVendorBaru !== null;
  if (perluCatatWaktu) {
    let waktuManual: Date | undefined;
    if (
      typeof body?.waktuLaporVendor === "string" &&
      body.waktuLaporVendor.trim()
    ) {
      waktuManual = new Date(body.waktuLaporVendor);
      if (Number.isNaN(waktuManual.getTime())) {
        return NextResponse.json(
          { error: "Waktu lapor ke vendor tidak valid." },
          { status: 400 }
        );
      }
      if (waktuManual.getTime() > Date.now()) {
        return NextResponse.json(
          { error: "Waktu lapor ke vendor tidak boleh di masa depan." },
          { status: 400 }
        );
      }
      if (waktuManual.getTime() < guard.ticket.waktuOpen.getTime()) {
        return NextResponse.json(
          { error: "Waktu lapor ke vendor tidak boleh sebelum waktu kejadian." },
          { status: 400 }
        );
      }
    }
    data.waktuLaporVendor = waktuManual ?? new Date();
  }

  // --- Field override Super Admin ---
  const sentSuperadminFields = SUPERADMIN_FIELDS.filter((f) =>
    hasField(body, f)
  );
  if (sentSuperadminFields.length > 0 && !isSuperadmin) {
    return NextResponse.json(
      {
        error:
          "Hanya Super Admin yang dapat mengubah kategori, ATM/lokasi, contact person, atau waktu kejadian.",
      },
      { status: 403 }
    );
  }

  if (isSuperadmin) {
    // Kategori tiket
    if (hasField(body, "kategori")) {
      const kategori = cleanStr(body.kategori);
      if (!KATEGORI.includes(kategori)) {
        return NextResponse.json(
          { error: "Kategori tiket tidak valid (ATM atau Jaringan)." },
          { status: 400 }
        );
      }
      data.kategori = kategori as TicketKategori;
    }

    // ATM / lokasi — wajib merujuk baris master yang ada.
    if (hasField(body, "atmId")) {
      const atmId = cleanStr(body.atmId);
      if (!atmId) {
        return NextResponse.json(
          { error: "ATM/lokasi wajib dipilih dari pencarian." },
          { status: 400 }
        );
      }
      const atm = await prisma.atmMaster.findUnique({
        where: { id: atmId },
        select: { id: true },
      });
      if (!atm) {
        return NextResponse.json(
          { error: "ATM/lokasi tidak ditemukan di master." },
          { status: 400 }
        );
      }
      data.atmId = atm.id;
    }

    // Contact Person — aturan wajib mengikuti form Open Tiket.
    if (hasField(body, "cpTipe")) {
      const cpTipe = cleanStr(body.cpTipe);
      if (!CP_TIPE.includes(cpTipe)) {
        return NextResponse.json(
          { error: "Contact Person tidak valid (No PIC atau WAG)." },
          { status: 400 }
        );
      }
      const cpNama = optStr(body?.cpNama);
      if (cpTipe === CpTipe.pic) {
        const cpTelp = optStr(body?.cpTelp);
        if (!cpNama || !cpTelp) {
          return NextResponse.json(
            { error: "No PIC wajib mengisi nama dan nomor telepon." },
            { status: 400 }
          );
        }
        data.cpTipe = CpTipe.pic;
        data.cpNama = cpNama;
        data.cpTelp = cpTelp;
      } else {
        if (!cpNama) {
          return NextResponse.json(
            { error: "Nama WAG (WhatsApp Group) wajib diisi." },
            { status: 400 }
          );
        }
        data.cpTipe = CpTipe.wag;
        data.cpNama = cpNama;
        // WAG tidak menyimpan nomor telepon.
        data.cpTelp = null;
      }
    }

    // Waktu kejadian (waktuOpen) — dasar perhitungan SLA.
    if (hasField(body, "waktuOpen")) {
      const raw = cleanStr(body.waktuOpen);
      if (!raw) {
        return NextResponse.json(
          { error: "Waktu kejadian wajib diisi." },
          { status: 400 }
        );
      }
      const waktuOpen = new Date(raw);
      if (Number.isNaN(waktuOpen.getTime())) {
        return NextResponse.json(
          { error: "Waktu kejadian tidak valid." },
          { status: 400 }
        );
      }
      // Cegah durasi SLA negatif pada tiket yang sudah ditutup.
      if (
        guard.ticket.status === TicketStatus.selesai &&
        guard.ticket.waktuSelesai &&
        waktuOpen.getTime() > guard.ticket.waktuSelesai.getTime()
      ) {
        return NextResponse.json(
          { error: "Waktu kejadian tidak boleh setelah waktu selesai tiket." },
          { status: 400 }
        );
      }
      data.waktuOpen = waktuOpen;
    }
  }

  const updated = await prisma.ticket.update({ where: { id }, data });

  // Jejak audit khusus override Super Admin — hanya bila ada field
  // superadmin-only yang benar-benar berubah nilainya.
  if (isSuperadmin && sentSuperadminFields.length > 0) {
    const snapshot = (t: typeof updated) => ({
      kategori: t.kategori,
      atmId: t.atmId,
      cpTipe: t.cpTipe,
      cpNama: t.cpNama,
      cpTelp: t.cpTelp,
      waktuOpen: t.waktuOpen,
    });
    const before = snapshot(guard.ticket);
    const after = snapshot(updated);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await writeAuditLog({
        userId: session.sub,
        username: session.username,
        action: "superadmin_update",
        tableName: "tickets",
        rowId: id,
        before: { noTiket: updated.noTiket, ...before },
        after: { noTiket: updated.noTiket, ...after },
      });
    }
  }

  return NextResponse.json({ item: { id: updated.id } });
}

/** DELETE /api/tickets/[id] — hapus tiket (gangguan sesaat). Owner/superadmin. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    // activities & handovers ikut terhapus (onDelete: Cascade di schema).
    await prisma.ticket.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
    }
    throw e;
  }
}
