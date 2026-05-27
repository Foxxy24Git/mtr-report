import { describe, it, expect } from "vitest";
import {
  SERVERS,
  SERVER_STATUS_OPTIONS,
  SERVER_FASES,
  AC_URUTAN,
  FASE_LABELS,
  normalizeUrutan,
  isValidFase,
  parseTanggal,
  todayKeyWIB,
} from "../suhuServer";

describe("SERVERS", () => {
  it("berisi 5 server sesuai PRD §4.H dengan urutan tetap", () => {
    expect(SERVERS.map((s) => s.key)).toEqual([
      "npay",
      "ajAtmb",
      "bifast",
      "prima",
      "cipHost",
    ]);
    expect(SERVERS.map((s) => s.label)).toEqual([
      "NPAY",
      "AJ-ATMB",
      "BI-FAST",
      "PRIMA",
      "Cip-Host",
    ]);
  });
});

describe("opsi status & konstanta", () => {
  it("status server: Transaksi Normal / Normal / Gangguan", () => {
    expect(SERVER_STATUS_OPTIONS).toEqual([
      "Transaksi Normal",
      "Normal",
      "Gangguan",
    ]);
  });
  it("AC dicek 3x per shift", () => {
    expect(AC_URUTAN).toEqual([1, 2, 3]);
  });
  it("log server diisi awal & akhir shift", () => {
    expect(SERVER_FASES).toEqual(["awal", "akhir"]);
    expect(FASE_LABELS.awal).toBe("Awal Shift");
    expect(FASE_LABELS.akhir).toBe("Akhir Shift");
  });
});

describe("normalizeUrutan", () => {
  it("menerima 1, 2, 3 (number & string)", () => {
    expect(normalizeUrutan(1)).toBe(1);
    expect(normalizeUrutan(3)).toBe(3);
    expect(normalizeUrutan("2")).toBe(2);
  });
  it("menolak nilai di luar 1..3", () => {
    expect(normalizeUrutan(0)).toBeNull();
    expect(normalizeUrutan(4)).toBeNull();
    expect(normalizeUrutan("x")).toBeNull();
    expect(normalizeUrutan(null)).toBeNull();
    expect(normalizeUrutan(undefined)).toBeNull();
  });
});

describe("isValidFase", () => {
  it("hanya awal/akhir yang valid", () => {
    expect(isValidFase("awal")).toBe(true);
    expect(isValidFase("akhir")).toBe(true);
    expect(isValidFase("tengah")).toBe(false);
    expect(isValidFase(null)).toBe(false);
  });
});

describe("parseTanggal", () => {
  it("parsing YYYY-MM-DD valid ke UTC midnight", () => {
    const d = parseTanggal("2026-05-27");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-05-27T00:00:00.000Z");
  });
  it("menolak format salah", () => {
    expect(parseTanggal("27-05-2026")).toBeNull();
    expect(parseTanggal("2026/05/27")).toBeNull();
    expect(parseTanggal("")).toBeNull();
    expect(parseTanggal(123)).toBeNull();
  });
  it("menolak tanggal mustahil", () => {
    expect(parseTanggal("2026-02-31")).toBeNull();
    expect(parseTanggal("2026-13-01")).toBeNull();
    expect(parseTanggal("2026-00-10")).toBeNull();
  });
});

describe("todayKeyWIB", () => {
  it("menggeser ke zona WIB (+7) sebelum mengambil tanggal", () => {
    // 20:00 UTC = 03:00 WIB keesokan harinya
    expect(todayKeyWIB(new Date("2026-05-27T20:00:00Z"))).toBe("2026-05-28");
    // 10:00 UTC = 17:00 WIB hari yang sama
    expect(todayKeyWIB(new Date("2026-05-27T10:00:00Z"))).toBe("2026-05-27");
  });
});
