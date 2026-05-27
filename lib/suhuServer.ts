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
