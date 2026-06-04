import "server-only";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildReportTicketWhere } from "@/lib/reportQuery";
import { resolveReportLogoPath } from "@/lib/appSettings";
import { buildLogbookRows, type LogbookRow } from "@/lib/logbookRows";

const TZ = "Asia/Jakarta";

/** "01 Juni 2026" untuk label periode header. */
function fmtTglPanjang(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(`${dateStr}T00:00:00+07:00`));
}

export interface GatherLogbookParams {
  dari: string; // YYYY-MM-DD (WIB)
  sampai: string; // YYYY-MM-DD (WIB)
  userId: string;
}

export interface LogbookData {
  namaPetugas: string;
  username: string;
  periodeLabel: string; // "01 Juni 2026 s/d 30 Juni 2026"
  rows: LogbookRow[];
  logoPath?: string | null;
}

export interface GatherLogbookResult {
  data: LogbookData;
  filename: string;
  sheetName: string;
  count: number;
}

/** Bersihkan nama sheet Excel (≤31 char, tanpa karakter terlarang). */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim();
  return cleaned.slice(0, 31) || "LOGBOOK";
}

/**
 * Kumpulkan data logbook satu petugas untuk rentang [dari, sampai].
 *
 * Filter HANYA `ownerUserId` (= pembuka tiket; immutable, tak berubah saat
 * serah terima) + rentang `waktuOpen`. Semua shift & semua status disertakan
 * (PRD revisi §4.D). Diurut by tanggal open ASC.
 */
export async function gatherLogbookData(
  p: GatherLogbookParams
): Promise<GatherLogbookResult> {
  const startWib = new Date(`${p.dari}T00:00:00+07:00`);
  const endWib = new Date(
    new Date(`${p.sampai}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000
  );

  const [user, ticketRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: p.userId },
      select: { nama: true, username: true },
    }),
    prisma.ticket.findMany({
      // Tanpa shift → filter hanya owner (pembuka) + rentang waktuOpen.
      where: buildReportTicketWhere({
        startWib,
        endWib,
        shift: null,
        ownerUserId: p.userId,
      }),
      orderBy: { waktuOpen: "asc" },
      select: {
        noTiket: true,
        openShiftKode: true,
        waktuOpen: true,
        waktuResponInternal: true,
        cpTipe: true,
        cpNama: true,
        cpTelp: true,
        jenisGangguan: true,
        sumberPenyebab: true,
        metodePenanganan: true,
        vendor: true,
        noTiketVendor: true,
        status: true,
        waktuSelesai: true,
        keterangan: true,
        atm: { select: { kodeAtm: true, namaAtm: true } },
        activities: {
          orderBy: { waktu: "asc" },
          select: { waktu: true, teks: true, isTindakLanjutFlag: true },
        },
      },
    }),
  ]);

  const namaPetugas = user?.nama ?? "Petugas";
  const username = user?.username ?? "user";

  const rows = buildLogbookRows(
    ticketRows.map((t) => ({
      ...t,
      openShiftKode: t.openShiftKode as ShiftKode,
    }))
  );

  const data: LogbookData = {
    namaPetugas,
    username,
    periodeLabel: `${fmtTglPanjang(p.dari)} s/d ${fmtTglPanjang(p.sampai)}`,
    rows,
    logoPath: await resolveReportLogoPath(),
  };

  return {
    data,
    filename: `LOGBOOK_${username}_${p.dari}_sd_${p.sampai}.xlsx`,
    sheetName: safeSheetName(`LOGBOOK ${namaPetugas}`),
    count: rows.length,
  };
}
