import { Prisma } from "@prisma/client";

/**
 * Database Studio — logika inti (registry tabel + metadata kolom dari DMMF +
 * sanitasi input). Modul murni/tanpa I/O kecuali baca DMMF statis, agar mudah
 * diuji. Route handler tipis di atasnya (lihat app/api/superadmin/db/**).
 *
 * Keamanan: hanya tabel di REGISTRY yang bisa diakses. Param `table` dari URL
 * dipetakan lewat registry — input pengguna tak pernah langsung jadi nama
 * delegate Prisma. Kolom sensitif (mis. users.passwordHash) di-mask & non-edit.
 */

export interface TableConfig {
  /** Kunci di URL (nama tabel fisik / snake_case). */
  key: string;
  /** Nama model Prisma (PascalCase, sesuai DMMF). */
  model: string;
  /** Label tampilan. */
  label: string;
  /** Field yang nilainya disembunyikan (mask) & tidak bisa diedit. */
  masked?: string[];
}

/** Daftar putih tabel yang boleh diakses Database Studio (PRD §3). */
export const REGISTRY: TableConfig[] = [
  { key: "tickets", model: "Ticket", label: "Tiket" },
  { key: "ticket_activities", model: "TicketActivity", label: "Aktivitas Tiket" },
  { key: "users", model: "User", label: "Akun", masked: ["passwordHash"] },
  { key: "leaders", model: "Leader", label: "Pimpinan" },
  { key: "atm_master", model: "AtmMaster", label: "Master ATM" },
  { key: "master_lookup", model: "MasterLookup", label: "Master Lookup" },
  { key: "shift_handovers", model: "ShiftHandover", label: "Serah Terima Shift" },
  { key: "ac_temp_logs", model: "AcTempLog", label: "Log Suhu AC" },
  { key: "server_logs", model: "ServerLog", label: "Log Server" },
];

export type ColumnKind = "scalar" | "enum";

export interface ColumnMeta {
  name: string;
  /** Tipe scalar Prisma (String/Int/Boolean/DateTime/Json/Float/Decimal/BigInt) atau nama enum. */
  type: string;
  kind: ColumnKind;
  isId: boolean;
  required: boolean;
  /** Boleh diubah lewat form edit. */
  editable: boolean;
  /** Nilai disamarkan di output & diabaikan saat update. */
  masked: boolean;
  /** Untuk kolom enum: pilihan nilai yang valid. */
  enumValues?: string[];
}

export const MASK_PLACEHOLDER = "••••••";

/** Cari konfigurasi tabel berdasarkan key URL. Null bila tidak terdaftar. */
export function getTableConfig(key: string): TableConfig | null {
  return REGISTRY.find((t) => t.key === key) ?? null;
}

/** Nama delegate Prisma client (camelCase) untuk sebuah model. */
export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Daftar tabel untuk dropdown UI. */
export function listTables(): { key: string; label: string }[] {
  return REGISTRY.map(({ key, label }) => ({ key, label }));
}

function findEnumValues(enumName: string): string[] | undefined {
  const e = Prisma.dmmf.datamodel.enums.find((x) => x.name === enumName);
  return e?.values.map((v) => v.name);
}

/**
 * Metadata kolom sebuah tabel dari DMMF. Hanya kolom scalar & enum yang
 * ditampilkan (relasi & list diabaikan). Field id / @updatedAt / @default(now())
 * jadi read-only; field di `masked` jadi non-edit + disamarkan.
 */
export function getColumns(cfg: TableConfig): ColumnMeta[] {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === cfg.model);
  if (!model) {
    throw new Error(`Model DMMF tidak ditemukan: ${cfg.model}`);
  }
  const masked = new Set(cfg.masked ?? []);

  return model.fields
    .filter((f) => (f.kind === "scalar" || f.kind === "enum") && !f.isList)
    .map((f): ColumnMeta => {
      const isNowDefault =
        typeof f.default === "object" &&
        f.default !== null &&
        "name" in f.default &&
        (f.default as { name?: string }).name === "now";
      const isMasked = masked.has(f.name);
      const readOnly = f.isId || f.isUpdatedAt || isNowDefault;

      return {
        name: f.name,
        type: f.type,
        kind: f.kind === "enum" ? "enum" : "scalar",
        isId: Boolean(f.isId),
        required: Boolean(f.isRequired),
        editable: !readOnly && !isMasked,
        masked: isMasked,
        enumValues: f.kind === "enum" ? findEnumValues(f.type) : undefined,
      };
    });
}

/** Nama kolom primary key (selalu "id" pada skema ini). */
export function idColumn(columns: ColumnMeta[]): string {
  return columns.find((c) => c.isId)?.name ?? "id";
}

/**
 * Bangun klausa `where` pencarian: cocok `contains` (case-insensitive) pada
 * semua kolom bertipe String. Kosong → {} (tanpa filter).
 */
export function buildWhere(
  columns: ColumnMeta[],
  search: string
): Record<string, unknown> {
  const q = search.trim();
  if (!q) return {};
  const stringCols = columns.filter((c) => c.kind === "scalar" && c.type === "String");
  if (stringCols.length === 0) return {};
  return {
    OR: stringCols.map((c) => ({
      [c.name]: { contains: q, mode: "insensitive" },
    })),
  };
}

/** Bangun `orderBy`. Default urut kolom id desc bila sortBy tak valid. */
export function buildOrderBy(
  columns: ColumnMeta[],
  sortBy: string | undefined,
  sortDir: string | undefined
): Record<string, "asc" | "desc"> {
  const dir: "asc" | "desc" = sortDir === "asc" ? "asc" : "desc";
  const valid = sortBy && columns.some((c) => c.name === sortBy);
  const field = valid ? (sortBy as string) : idColumn(columns);
  return { [field]: dir };
}

/** Samarkan field masked pada satu baris (nilai non-null → placeholder). */
export function maskRow(
  columns: ColumnMeta[],
  row: Record<string, unknown>
): Record<string, unknown> {
  const maskedCols = columns.filter((c) => c.masked).map((c) => c.name);
  if (maskedCols.length === 0) return row;
  const out = { ...row };
  for (const name of maskedCols) {
    if (out[name] !== null && out[name] !== undefined) out[name] = MASK_PLACEHOLDER;
  }
  return out;
}

export interface SanitizeResult {
  data: Record<string, unknown>;
  errors: string[];
}

function coerce(col: ColumnMeta, raw: unknown): { value?: unknown; error?: string } {
  // null hanya untuk kolom opsional.
  if (raw === null || raw === "") {
    if (col.required) return { error: `${col.name} wajib diisi.` };
    return { value: null };
  }
  if (col.kind === "enum") {
    const v = String(raw);
    if (!col.enumValues?.includes(v)) {
      return { error: `${col.name} bukan nilai valid (${col.enumValues?.join(", ")}).` };
    }
    return { value: v };
  }
  switch (col.type) {
    case "Boolean":
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true") return { value: true };
      if (raw === "false") return { value: false };
      return { error: `${col.name} harus boolean.` };
    case "Int":
    case "BigInt": {
      const n = Number(raw);
      if (!Number.isInteger(n)) return { error: `${col.name} harus bilangan bulat.` };
      return { value: n };
    }
    case "Float":
    case "Decimal": {
      const n = Number(raw);
      if (Number.isNaN(n)) return { error: `${col.name} harus angka.` };
      return { value: n };
    }
    case "DateTime": {
      const d = new Date(raw as string);
      if (Number.isNaN(d.getTime())) return { error: `${col.name} tanggal tidak valid.` };
      return { value: d };
    }
    case "Json":
      if (typeof raw === "string") {
        try {
          return { value: JSON.parse(raw) };
        } catch {
          return { error: `${col.name} JSON tidak valid.` };
        }
      }
      return { value: raw };
    default:
      return { value: String(raw) };
  }
}

/**
 * Saring & koersi body update: hanya kolom `editable` yang hadir di body yang
 * diterima. Kolom read-only/masked/tak dikenal diabaikan diam-diam (server
 * sebagai sumber kebenaran). Mengembalikan data Prisma + daftar error validasi.
 */
export function sanitizeUpdate(
  columns: ColumnMeta[],
  body: Record<string, unknown> | null | undefined
): SanitizeResult {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  if (!body || typeof body !== "object") return { data, errors: ["Body tidak valid."] };

  for (const col of columns) {
    if (!col.editable) continue;
    if (!(col.name in body)) continue;
    const { value, error } = coerce(col, body[col.name]);
    if (error) errors.push(error);
    else data[col.name] = value;
  }
  return { data, errors };
}
