import { describe, it, expect } from "vitest";
import {
  getTableConfig,
  delegateName,
  listTables,
  getColumns,
  idColumn,
  buildWhere,
  buildOrderBy,
  maskRow,
  sanitizeUpdate,
  MASK_PLACEHOLDER,
} from "../dbStudio";

describe("getTableConfig", () => {
  it("menemukan tabel terdaftar", () => {
    expect(getTableConfig("users")?.model).toBe("User");
  });
  it("null untuk tabel tak terdaftar (anti-akses sembarang)", () => {
    expect(getTableConfig("audit_logs")).toBeNull();
    expect(getTableConfig("pg_user; DROP TABLE")).toBeNull();
  });
});

describe("delegateName", () => {
  it("ubah nama model ke delegate camelCase", () => {
    expect(delegateName("Ticket")).toBe("ticket");
    expect(delegateName("TicketActivity")).toBe("ticketActivity");
    expect(delegateName("AtmMaster")).toBe("atmMaster");
  });
});

describe("listTables", () => {
  it("kembalikan key + label untuk dropdown", () => {
    const t = listTables();
    expect(t.find((x) => x.key === "users")?.label).toBe("Akun");
  });
});

describe("getColumns (dari DMMF)", () => {
  const cols = getColumns(getTableConfig("users")!);
  const by = (n: string) => cols.find((c) => c.name === n)!;

  it("id read-only", () => {
    expect(by("id").isId).toBe(true);
    expect(by("id").editable).toBe(false);
  });
  it("createdAt (@default now) read-only", () => {
    expect(by("createdAt").editable).toBe(false);
  });
  it("passwordHash di-mask & non-edit", () => {
    expect(by("passwordHash").masked).toBe(true);
    expect(by("passwordHash").editable).toBe(false);
  });
  it("field biasa editable", () => {
    expect(by("nama").editable).toBe(true);
    expect(by("isAktif").editable).toBe(true); // @default(true) tetap editable
  });
  it("kolom enum membawa daftar nilai", () => {
    const role = by("role");
    expect(role.kind).toBe("enum");
    expect(role.enumValues).toContain("superadmin");
  });
  it("relasi & list diabaikan", () => {
    expect(cols.find((c) => c.name === "ticketsOwned")).toBeUndefined();
  });
});

describe("idColumn", () => {
  it("kembalikan kolom id", () => {
    expect(idColumn(getColumns(getTableConfig("leaders")!))).toBe("id");
  });
});

describe("buildWhere", () => {
  const cols = getColumns(getTableConfig("users")!);
  it("kosong → tanpa filter", () => {
    expect(buildWhere(cols, "  ")).toEqual({});
  });
  it("cari → OR contains insensitive pada kolom String", () => {
    const w = buildWhere(cols, "andi") as { OR: Record<string, unknown>[] };
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toContainEqual({ nama: { contains: "andi", mode: "insensitive" } });
    // tidak menyertakan kolom non-String (mis. enum role / boolean isAktif)
    const names = w.OR.map((c) => Object.keys(c)[0]);
    expect(names).not.toContain("role");
    expect(names).not.toContain("isAktif");
  });
});

describe("buildOrderBy", () => {
  const cols = getColumns(getTableConfig("users")!);
  it("default id desc bila sortBy invalid", () => {
    expect(buildOrderBy(cols, "kolom_palsu", undefined)).toEqual({ id: "desc" });
  });
  it("pakai kolom valid + arah asc", () => {
    expect(buildOrderBy(cols, "nama", "asc")).toEqual({ nama: "asc" });
  });
});

describe("maskRow", () => {
  const cols = getColumns(getTableConfig("users")!);
  it("ganti nilai masked dengan placeholder", () => {
    const out = maskRow(cols, { id: "1", nama: "Andi", passwordHash: "secret" });
    expect(out.passwordHash).toBe(MASK_PLACEHOLDER);
    expect(out.nama).toBe("Andi");
  });
  it("biarkan null apa adanya", () => {
    const out = maskRow(cols, { passwordHash: null });
    expect(out.passwordHash).toBeNull();
  });
});

describe("sanitizeUpdate", () => {
  const cols = getColumns(getTableConfig("users")!);

  it("buang field read-only/masked/tak dikenal", () => {
    const { data } = sanitizeUpdate(cols, {
      nama: "Baru",
      id: "hack",
      passwordHash: "x",
      createdAt: "2020-01-01",
      kolomAsing: 1,
    });
    expect(data).toEqual({ nama: "Baru" });
  });

  it("koersi boolean", () => {
    expect(sanitizeUpdate(cols, { isAktif: "false" }).data.isAktif).toBe(false);
    expect(sanitizeUpdate(cols, { isAktif: true }).data.isAktif).toBe(true);
  });

  it("validasi enum", () => {
    expect(sanitizeUpdate(cols, { role: "user" }).data.role).toBe("user");
    expect(sanitizeUpdate(cols, { role: "raja" }).errors.length).toBe(1);
  });

  it("kolom opsional kosong → null; wajib kosong → error", () => {
    expect(sanitizeUpdate(cols, { fotoProfilUrl: "" }).data.fotoProfilUrl).toBeNull();
    expect(sanitizeUpdate(cols, { nama: "" }).errors.length).toBe(1);
  });

  it("body bukan objek → error", () => {
    expect(sanitizeUpdate(cols, null).errors.length).toBeGreaterThan(0);
  });
});
