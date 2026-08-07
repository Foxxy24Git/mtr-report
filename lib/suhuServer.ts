// Logika murni Pemantauan Suhu AC & Log Server (PRD §4.H).
// Tanpa I/O — dipakai di server (API), client (form), & nanti export Excel.

export type ServerKey = "npay" | "ajAtmb" | "bifast" | "prima" | "cipHost";

export interface ServerDef {
  key: ServerKey;
  label: string;
}

/** Server yang dipantau & urutan tampilannya (PRD §4.H). */
export const SERVERS: ServerDef[] = [
  { key: "npay", label: "NPAY" },
  { key: "ajAtmb", label: "AJ-ATMB" },
  { key: "bifast", label: "BI-FAST" },
  { key: "prima", label: "PRIMA" },
  { key: "cipHost", label: "Cip-Host" },
];

export const SERVER_STATUS_OPTIONS = [
  "Transaksi Normal",
  "Normal",
  "Gangguan",
] as const;

/** Batas pilihan suhu AC (°C) pada dropdown pengecekan. */
export const SUHU_MIN = 15;
export const SUHU_MAX = 30;

/** Pilihan suhu 15°C–30°C (kelipatan 1°C) untuk Room Server & Ruangan Panel. */
export const SUHU_OPTIONS: string[] = Array.from(
  { length: SUHU_MAX - SUHU_MIN + 1 },
  (_, i) => `${SUHU_MIN + i}°C`
);

/** Status pemantauan berkala 12 jam AC (kiri & kanan). */
export const PEMANTAUAN_STATUS_OPTIONS = ["Normal", "Tidak Normal"] as const;

/** Nilai default pemantauan 12 jam saat form dibuka tanpa data existing. */
export const PEMANTAUAN_DEFAULT: string = PEMANTAUAN_STATUS_OPTIONS[0];

/** AC dicek 3x per shift. */
export const AC_URUTAN = [1, 2, 3] as const;
export type AcUrutan = (typeof AC_URUTAN)[number];

/** Log server diisi 2x: awal & akhir shift. */
export const SERVER_FASES = ["awal", "akhir"] as const;
export type ServerFaseValue = (typeof SERVER_FASES)[number];

export const FASE_LABELS: Record<ServerFaseValue, string> = {
  awal: "Awal Shift",
  akhir: "Akhir Shift",
};

/** Validasi & normalisasi urutan pengecekan AC (1..3). null jika invalid. */
export function normalizeUrutan(v: unknown): AcUrutan | null {
  const n = typeof v === "number" ? v : Number(v);
  return n === 1 || n === 2 || n === 3 ? (n as AcUrutan) : null;
}

/** True bila fase log server valid. */
export function isValidFase(v: unknown): v is ServerFaseValue {
  return v === "awal" || v === "akhir";
}

/** Parse "YYYY-MM-DD" → Date (UTC midnight) untuk kolom @db.Date. null jika invalid. */
export function parseTanggal(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Tolak tanggal mustahil (mis. 2026-02-31 yang akan "overflow").
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Kunci tanggal hari ini di zona WIB (Asia/Jakarta), format YYYY-MM-DD. */
export function todayKeyWIB(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(now);
}

export interface AcCheckFields {
  urutan: number;
  suhuRoomServer: string | null;
  suhuPanel: string | null;
  pantau12jamKiri: string | null;
  pantau12jamKanan: string | null;
}

export interface ServerLogFields {
  fase: ServerFaseValue;
  npay: string | null;
  ajAtmb: string | null;
  bifast: string | null;
  prima: string | null;
  cipHost: string | null;
}

/** True bila SEMUA field nilai 1 baris pengecekan AC sudah terisi (bukan cuma waktu). */
export function isAcCheckFilled(log: AcCheckFields | undefined): boolean {
  if (!log) return false;
  return Boolean(
    log.suhuRoomServer && log.suhuPanel && log.pantau12jamKiri && log.pantau12jamKanan
  );
}

/** True bila status kelima server pada 1 fase (awal/akhir) sudah terisi semua. */
export function isServerLogFilled(log: ServerLogFields | undefined): boolean {
  if (!log) return false;
  return Boolean(log.npay && log.ajAtmb && log.bifast && log.prima && log.cipHost);
}

/**
 * Daftar label item Suhu AC & Log Server yang BELUM lengkap untuk 1 shift.
 * Array kosong = lengkap. Dipakai gate wajib isi sebelum serah terima/tutup
 * laporan (lihat app/api/shift/handover/route.ts & app/api/shift/close/route.ts).
 */
export function findMissingSuhuServerItems(
  acLogs: AcCheckFields[],
  serverLogs: ServerLogFields[]
): string[] {
  const missing: string[] = [];
  for (const urutan of AC_URUTAN) {
    const log = acLogs.find((l) => l.urutan === urutan);
    if (!isAcCheckFilled(log)) missing.push(`Suhu AC pengecekan ke-${urutan}`);
  }
  for (const fase of SERVER_FASES) {
    const log = serverLogs.find((l) => l.fase === fase);
    if (!isServerLogFilled(log)) missing.push(`Log Server ${FASE_LABELS[fase]}`);
  }
  return missing;
}
