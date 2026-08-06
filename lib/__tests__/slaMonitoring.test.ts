import { describe, it, expect, vi } from "vitest";
import { hitungRestitusi } from "../slaMonitoring";

describe("hitungRestitusi", () => {
  it("SLA >= 99.5% → bebas restitusi (0%)", () => {
    expect(hitungRestitusi(1.0)).toEqual({ restitusiPersen: 0, label: "0%" });
    expect(hitungRestitusi(0.995)).toEqual({ restitusiPersen: 0, label: "0%" });
  });
  it("99.0% <= SLA < 99.5% → 2%", () => {
    expect(hitungRestitusi(0.99)).toEqual({ restitusiPersen: 2, label: "2%" });
    expect(hitungRestitusi(0.9949)).toEqual({ restitusiPersen: 2, label: "2%" });
  });
  it("90.0% <= SLA < 91.0% → 40%", () => {
    expect(hitungRestitusi(0.9)).toEqual({ restitusiPersen: 40, label: "40%" });
  });
  it("tepat 70,0% → Bebas Biaya Bulanan (BUKAN tier 60%)", () => {
    expect(hitungRestitusi(0.7)).toEqual({
      restitusiPersen: null,
      label: "Bebas Biaya Bulanan",
    });
  });
  it("70,0% < SLA < 90,0% → 60%", () => {
    expect(hitungRestitusi(0.7001)).toEqual({ restitusiPersen: 60, label: "60%" });
    expect(hitungRestitusi(0.8999)).toEqual({ restitusiPersen: 60, label: "60%" });
  });
  it("SLA < 70,0% → Bebas Biaya Bulanan", () => {
    expect(hitungRestitusi(0)).toEqual({
      restitusiPersen: null,
      label: "Bebas Biaya Bulanan",
    });
  });
});

const ATM1 = {
  id: "atm-a1",
  kodeAtm: "A1",
  namaAtm: "ATM A1",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};
const ATM2 = {
  id: "atm-a2",
  kodeAtm: "A2",
  namaAtm: "ATM A2",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};

// Rentang filter 2026-08-01 s.d. 2026-08-01 → totalMenitPeriode = 1440.
const FIXTURE_ROWS = [
  {
    id: "t-a1",
    atmId: "atm-a1",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T02:00:00+07:00"), // 60 menit dari open
    noTiketVendor: null,
    waktuLaporVendor: null, // TIDAK PERNAH lapor vendor → N/A di basis eksternal
    atm: ATM1,
  },
  {
    id: "t-a2",
    atmId: "atm-a2",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T03:00:00+07:00"), // 120 menit dari open
    noTiketVendor: "VDR-1",
    waktuLaporVendor: new Date("2026-08-01T01:30:00+07:00"), // 90 menit dari lapor vendor
    atm: ATM2,
  },
];

vi.mock("../prisma", () => ({
  prisma: { ticket: { findMany: async () => FIXTURE_ROWS } },
}));

describe("getLowestSla — basis internal (default, formula lama tidak berubah)", () => {
  it("downtime dihitung dari waktuOpen, semua ATM masuk", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    expect(res.items).toHaveLength(2);
    // Urut SLA terendah dulu → A2 (downtime 120) lebih rendah dari A1 (downtime 60).
    expect(res.items[0].kodeAtm).toBe("A2");
    expect(res.items[0].totalDowntimeMenit).toBe(120);
    expect(res.items[1].kodeAtm).toBe("A1");
    expect(res.items[1].totalDowntimeMenit).toBe(60);
    expect(res.items[0].restitusi).toBeUndefined();
  });
});

describe("getLowestSla — basis eksternal", () => {
  it("ATM tanpa waktuLaporVendor dikecualikan (N/A), downtime dari waktuLaporVendor, ada restitusi", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].kodeAtm).toBe("A2");
    expect(res.items[0].totalDowntimeMenit).toBe(90); // 03:00 - 01:30, BUKAN dari waktuOpen
    expect(res.items[0].slaPersenLabel).toBe("93.75%");
    expect(res.items[0].restitusi).toEqual({ restitusiPersen: 25, label: "25%" });
  });
});

describe("parseSlaBasis", () => {
  it("tanpa param → default internal", async () => {
    const { parseSlaBasis } = await import("../slaMonitoring");
    const res = parseSlaBasis(new URLSearchParams());
    expect(res).toEqual({ ok: true, basis: "internal" });
  });
  it("basis=eksternal valid", async () => {
    const { parseSlaBasis } = await import("../slaMonitoring");
    const res = parseSlaBasis(new URLSearchParams("basis=eksternal"));
    expect(res).toEqual({ ok: true, basis: "eksternal" });
  });
  it("nilai tidak valid → error", async () => {
    const { parseSlaBasis } = await import("../slaMonitoring");
    const res = parseSlaBasis(new URLSearchParams("basis=lainnya"));
    expect(res.ok).toBe(false);
  });
});

describe("getSlaSummary — basis internal vs eksternal", () => {
  it("basis internal: semua tiket dihitung, downtime dari waktuOpen", async () => {
    const { getSlaSummary } = await import("../slaMonitoring");
    const res = await getSlaSummary({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    expect(res.totalTiket).toBe(2);
    expect(res.totalDowntimeMenit).toBe(180); // 60 (A1) + 120 (A2)
  });

  it("basis eksternal: hanya tiket ber-waktuLaporVendor dihitung", async () => {
    const { getSlaSummary } = await import("../slaMonitoring");
    const res = await getSlaSummary(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.totalTiket).toBe(1); // hanya t-a2, t-a1 dikecualikan (N/A)
    expect(res.totalDowntimeMenit).toBe(90); // dari waktuLaporVendor, bukan waktuOpen
    expect(res.atmBermasalah).toBe(1); // A1 tidak ikut terhitung "bermasalah" di basis ini
  });
});
