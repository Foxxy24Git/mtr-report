import "server-only";
import { prisma } from "@/lib/prisma";
import {
  buildLengkapTicketWhere,
  computeLengkapRange,
  lengkapTicketInclude,
  mapLengkapTicket,
  type LengkapTicket,
} from "@/lib/reportLengkapQuery";

export interface GatherLengkapParams {
  tanggalDari: string; // YYYY-MM-DD (WIB)
  tanggalSampai: string; // YYYY-MM-DD (WIB)
}

export interface GatherLengkapResult {
  tickets: LengkapTicket[];
  count: number;
  tanggalDari: string;
  tanggalSampai: string;
}

/**
 * Ambil SEMUA tiket dalam rentang (semua petugas & semua shift) sebagai satu
 * dataset datar siap generate Excel (Fase 2). Logika murni (where / map / SLA)
 * ada di lib/reportLengkapQuery.ts.
 */
export async function gatherLaporanLengkap(
  p: GatherLengkapParams
): Promise<GatherLengkapResult> {
  const range = computeLengkapRange(p.tanggalDari, p.tanggalSampai);

  const rows = await prisma.ticket.findMany({
    where: buildLengkapTicketWhere(range),
    // created_at ASC lalu shift asal ASC (openShiftKode) — kelompok per shift
    // tetap rapi dalam satu sheet gabungan.
    orderBy: [{ createdAt: "asc" }, { openShiftKode: "asc" }],
    include: lengkapTicketInclude,
  });

  const tickets = rows.map(mapLengkapTicket);
  return {
    tickets,
    count: tickets.length,
    tanggalDari: p.tanggalDari,
    tanggalSampai: p.tanggalSampai,
  };
}
