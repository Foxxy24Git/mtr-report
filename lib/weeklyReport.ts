import "server-only";
import archiver from "archiver";
import { prisma } from "@/lib/prisma";
import { gatherReportData } from "@/lib/reportData";
import { buildReportWorkbook } from "@/lib/excelReport";
import { SHIFT_NAMES } from "@/lib/constants";
import { fmtDateKey } from "@/lib/format";

const TZ = "Asia/Jakarta";
const DAY_MS = 86_400_000;

export interface WeeklyParams {
  fromKey: string; // YYYY-MM-DD (WIB)
  toKey: string; // YYYY-MM-DD (WIB)
  /** Bila diisi, hanya tiket milik user ini yang digenerate (petugas non-admin). */
  ownerUserId?: string | null;
}

export interface WeeklyResult {
  buffer: Buffer;
  filename: string;
  fileCount: number;
  errorCount: number;
}

/** Slug shift tanpa spasi/jam untuk nama file (mis. "ShiftPagi"). */
function shiftSlug(shift: string): string {
  return (SHIFT_NAMES[shift] ?? `Shift${shift}`).replace(/\s+/g, "");
}

/** Timestamp WIB format YYYYMMDDHHmmss untuk nama file ZIP. */
function timestampWIB(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

/**
 * Generate ZIP berisi banyak Excel laporan harian (Form OPS-001), satu file
 * per kombinasi (tanggal × user × shift) yang memiliki tiket (PRD §4.D, §6).
 *
 * Strategi optimasi: hanya kombinasi yang punya tiket pada rentang yang
 * digenerate (tidak membuat file kosong). Bersifat fail-safe: bila satu
 * laporan gagal dibuat, dicatat di `_ERRORS.txt` dan proses tetap lanjut.
 */
export async function buildWeeklyReportZip(p: WeeklyParams): Promise<WeeklyResult> {
  const from = new Date(`${p.fromKey}T00:00:00.000+07:00`);
  const to = new Date(`${p.toKey}T23:59:59.999+07:00`);

  // Ambil tiket dalam rentang → tentukan kombinasi (hari × owner × shift) non-kosong.
  const ticketRows = await prisma.ticket.findMany({
    where: {
      waktuOpen: { gte: from, lte: to },
      ...(p.ownerUserId ? { ownerUserId: p.ownerUserId } : {}),
    },
    // openShiftKode (shift asal) agar kombinasi file sejalan dengan filter
    // laporan di gatherReportData (yang juga memakai openShiftKode).
    select: { waktuOpen: true, ownerUserId: true, openShiftKode: true },
    orderBy: { waktuOpen: "asc" },
  });

  // Kumpulkan owner untuk pemetaan username (nama file).
  const ownerIds = [...new Set(ticketRows.map((t) => t.ownerUserId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, username: true },
  });
  const usernameOf = new Map(owners.map((u) => [u.id, u.username]));

  // Set kombinasi unik "dateKey|ownerId|shift".
  const combos = new Map<
    string,
    { dateKey: string; ownerId: string; shift: string }
  >();
  for (const t of ticketRows) {
    const dateKey = fmtDateKey(t.waktuOpen);
    const key = `${dateKey}|${t.ownerUserId}|${t.openShiftKode}`;
    if (!combos.has(key)) {
      combos.set(key, { dateKey, ownerId: t.ownerUserId, shift: t.openShiftKode });
    }
  }

  // Urutkan: tanggal → username → shift (agar struktur ZIP rapi & deterministik).
  const sorted = [...combos.values()].sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    const ua = usernameOf.get(a.ownerId) ?? a.ownerId;
    const ub = usernameOf.get(b.ownerId) ?? b.ownerId;
    if (ua !== ub) return ua < ub ? -1 : 1;
    return a.shift < b.shift ? -1 : a.shift > b.shift ? 1 : 0;
  });

  const root = `LAPORAN_WEEKLY_${p.fromKey}_${p.toKey}`;
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("warning", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      reject(err);
    });
    archive.on("error", reject);
  });

  let fileCount = 0;
  const errors: string[] = [];

  for (const c of sorted) {
    const username = usernameOf.get(c.ownerId) ?? c.ownerId;
    const fileName = `LAPORAN_${username}_${shiftSlug(c.shift)}_${c.dateKey}.xlsx`;
    try {
      const { data } = await gatherReportData({
        tanggal: c.dateKey,
        shift: c.shift,
        ownerUserId: c.ownerId,
      });
      const buf = await buildReportWorkbook(data);
      archive.append(buf, { name: `${root}/${c.dateKey}/${fileName}` });
      fileCount++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${c.dateKey}/${fileName}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    archive.append(
      `Beberapa laporan gagal dibuat (proses tetap dilanjutkan):\n\n${errors.join("\n")}\n`,
      { name: `${root}/_ERRORS.txt` }
    );
  }

  await archive.finalize();
  await finished;

  return {
    buffer: Buffer.concat(chunks),
    filename: `${root}_${timestampWIB()}.zip`,
    fileCount,
    errorCount: errors.length,
  };
}
