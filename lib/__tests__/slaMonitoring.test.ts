import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// Baris yang dikembalikan mock Prisma. Default FIXTURE_ROWS; blok describe
// tertentu menggantinya sementara lewat `withRows()` untuk skenario khusus.
let mockRows: unknown[] = FIXTURE_ROWS;

vi.mock("../prisma", () => ({
  prisma: { ticket: { findMany: async () => mockRows } },
}));

/** Pakai fixture lain untuk satu blok describe, lalu kembalikan ke default. */
function withRows(rows: unknown[]): void {
  beforeEach(() => {
    mockRows = rows;
  });
  afterEach(() => {
    mockRows = FIXTURE_ROWS;
  });
}

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

// --- Skenario: No Tiket Vendor baru diisi SETELAH tiket ditutup ---------------
// Urutan nyata di lapangan: operator menutup tiket dulu, baru mengisi No Tiket
// Vendor sebagai langkah administratif. Durasi laporVendor→selesai jadi negatif;
// kalau di-clamp ke 0 menit, ATM tampak ~100% SLA & restitusi "0%" — menyesatkan
// (restitusi adalah angka denda kontraktual). Harus N/A seperti waktuLaporVendor
// yang null.
const ATM3 = {
  id: "atm-a3",
  kodeAtm: "A3",
  namaAtm: "ATM A3",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};

const ROWS_LAPOR_SETELAH_SELESAI = [
  {
    id: "t-a3",
    atmId: "atm-a3",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T02:00:00+07:00"), // 60 menit dari open
    noTiketVendor: "VDR-9",
    waktuLaporVendor: new Date("2026-08-01T02:30:00+07:00"), // 30 menit SETELAH selesai
    atm: ATM3,
  },
  FIXTURE_ROWS[1], // t-a2: tiket vendor "normal" sebagai pembanding
];

describe("basis eksternal — waktuLaporVendor tercatat setelah waktuSelesai", () => {
  withRows(ROWS_LAPOR_SETELAH_SELESAI);

  it("getLowestSla: tiket tsb dikecualikan (N/A), bukan downtime 0 menit", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.items.map((i) => i.kodeAtm)).toEqual(["A2"]);
    expect(res.items[0].totalDowntimeMenit).toBe(90);
  });

  it("getSlaSummary: tiket tsb tidak ikut totalTiket & totalDowntime", async () => {
    const { getSlaSummary } = await import("../slaMonitoring");
    const res = await getSlaSummary(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.totalTiket).toBe(1); // hanya t-a2
    expect(res.totalDowntimeMenit).toBe(90); // TIDAK +0 menit dari t-a3
    expect(res.atmBermasalah).toBe(1); // A3 tidak dihitung "bermasalah" di basis ini
  });

  it("basis internal tidak terpengaruh (tetap dari waktuOpen)", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla({
      dari: "2026-08-01",
      sampai: "2026-08-01",
      kategori: "semua",
    });
    expect(res.items).toHaveLength(2);
    const a3 = res.items.find((i) => i.kodeAtm === "A3")!;
    expect(a3.totalDowntimeMenit).toBe(60);
  });
});

// --- Skenario: satu ATM, dua tiket (pengecualian bersifat PER-TIKET) ----------
// Pengecualian basis eksternal berlaku per-tiket, BUKAN per-ATM: ATM dengan 2
// tiket (satu ber-vendor, satu tidak) tetap muncul, memakai downtime tiket
// ber-vendor saja.
const ROWS_SATU_ATM_DUA_TIKET = [
  {
    id: "t-b1",
    atmId: "atm-a1",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T02:00:00+07:00"), // 60 menit dari open
    noTiketVendor: null,
    waktuLaporVendor: null, // tanpa vendor → N/A di basis eksternal
    atm: ATM1,
  },
  {
    id: "t-b2",
    atmId: "atm-a1",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T04:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T06:00:00+07:00"), // 120 menit dari open
    noTiketVendor: "VDR-2",
    waktuLaporVendor: new Date("2026-08-01T05:00:00+07:00"), // 60 menit dari lapor vendor
    atm: ATM1,
  },
];

describe("basis eksternal — pengecualian per-tiket, bukan per-ATM", () => {
  withRows(ROWS_SATU_ATM_DUA_TIKET);

  it("getLowestSla: ATM tetap muncul, hanya memakai downtime tiket ber-vendor", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].kodeAtm).toBe("A1"); // TIDAK dikecualikan sebagai satu ATM
    expect(res.items[0].totalTiket).toBe(1); // hanya t-b2 yang dihitung
    expect(res.items[0].totalDowntimeMenit).toBe(60); // bukan 180 (dua tiket) & bukan 120
    expect(res.items[0].slaPersenLabel).toBe("95.83%"); // (1440-60)/1440
  });

  it("basis internal: kedua tiket ATM yang sama tetap diakumulasi", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla({
      dari: "2026-08-01",
      sampai: "2026-08-01",
      kategori: "semua",
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].totalTiket).toBe(2);
    expect(res.items[0].totalDowntimeMenit).toBe(180); // 60 + 120 dari waktuOpen
  });
});

// --- getSlaDrilldownTickets ---------------------------------------------------
// Satu ATM, dua tiket: satu vendor-tracked yang lolos adaBasisEksternal, satu
// tidak. Jumlah baris drill-down HARUS selalu cocok dengan angka yang diklik
// di dashboard (basis-aware utk mode sla-terendah, basis-independent utk mode
// paling-bermasalah).
const DRILL_ATM = { kodeAtm: "D1", namaAtm: "ATM Drilldown Uji" };

const ROWS_DRILLDOWN = [
  {
    id: "t-d1",
    noTiket: "TD-0001",
    atmId: "atm-d1",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T02:00:00+07:00"),
    jenisGangguan: "Listrik Padam",
    sumberPenyebab: "PLN",
    noTiketVendor: null,
    waktuLaporVendor: null, // tidak lolos adaBasisEksternal
    atm: DRILL_ATM,
  },
  {
    id: "t-d2",
    noTiket: "TD-0002",
    atmId: "atm-d1",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T03:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T04:00:00+07:00"),
    jenisGangguan: "Jaringan Putus",
    sumberPenyebab: "Telkom",
    noTiketVendor: "VDR-9",
    waktuLaporVendor: new Date("2026-08-01T03:15:00+07:00"), // lolos adaBasisEksternal
    atm: DRILL_ATM,
  },
];

describe("getSlaDrilldownTickets", () => {
  withRows(ROWS_DRILLDOWN);

  const baseFilter = { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" as const };

  it("mode sla-terendah, basis eksternal: hanya tiket yang lolos adaBasisEksternal", async () => {
    const { getSlaDrilldownTickets } = await import("../slaMonitoring");
    const res = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "sla-terendah",
      atmId: "atm-d1",
      basis: "eksternal",
    });
    expect(res).toHaveLength(1);
    expect(res[0].noTiket).toBe("TD-0002");
  });

  it("mode sla-terendah, basis internal (default): semua tiket selesai ATM itu", async () => {
    const { getSlaDrilldownTickets } = await import("../slaMonitoring");
    const res = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "sla-terendah",
      atmId: "atm-d1",
    });
    expect(res).toHaveLength(2);
  });

  it("mode paling-bermasalah: selalu 2 baris terlepas dari basis yang dikirim", async () => {
    const { getSlaDrilldownTickets } = await import("../slaMonitoring");
    const resEksternal = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "paling-bermasalah",
      atmId: "atm-d1",
      basis: "eksternal",
    });
    const resInternal = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "paling-bermasalah",
      atmId: "atm-d1",
    });
    expect(resEksternal).toHaveLength(2);
    expect(resInternal).toHaveLength(2);
  });
});
