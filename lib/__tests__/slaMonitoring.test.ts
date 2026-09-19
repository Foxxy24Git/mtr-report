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
  prisma: {
    ticket: {
      // Default slaEpisodes: [] utk fixture lama yang belum punya field ini —
      // ...r di belakang supaya fixture yang SUDAH set slaEpisodes sendiri
      // (mis. ROWS_MULTI_EPISODE) tetap menang (override default).
      findMany: async () =>
        mockRows.map((r) => ({ slaEpisodes: [], ...(r as object) })),
    },
  },
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

describe("getLowestSla — basis internal (berhenti di titik serah terima vendor kalau ada)", () => {
  it("A1 (tanpa vendor) downtime penuh; A2 (ada vendor sejak 01:30) internal berhenti di situ", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    expect(res.items).toHaveLength(2);
    // A1: tanpa vendor → downtime penuh 60 menit (01:00-02:00 waktuSelesai).
    // A2: ada vendor sejak 01:30 → internal CUMA 30 menit (01:00-01:30), BUKAN
    // 120 menit (01:00-03:00) — tanggung jawab sudah "pindah" ke eksternal
    // sejak 01:30, jadi A1 kini yang SLA internal-nya lebih rendah, bukan A2.
    expect(res.items[0].kodeAtm).toBe("A1");
    expect(res.items[0].totalDowntimeMenit).toBe(60);
    expect(res.items[1].kodeAtm).toBe("A2");
    expect(res.items[1].totalDowntimeMenit).toBe(30);
    expect(res.items[0].restitusi).toBeUndefined();
  });
});

describe("Internal & Eksternal sekuensial — total durasi tiket terbagi persis di titik serah terima", () => {
  it("internal (open→lapor vendor) + eksternal (lapor vendor→selesai) = durasi penuh tiket, tidak tumpang tindih", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const resInternal = await getLowestSla({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    const resEksternal = await getLowestSla(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    const a2Internal = resInternal.items.find((i) => i.kodeAtm === "A2")!;
    const a2Eksternal = resEksternal.items.find((i) => i.kodeAtm === "A2")!;
    // t-a2: waktuOpen 01:00 → waktuLaporVendor 01:30 → waktuSelesai 03:00.
    // Total durasi tiket = 120 menit, dipecah PERSIS di 01:30: 30 + 90 = 120.
    expect(a2Internal.totalDowntimeMenit).toBe(30);
    expect(a2Eksternal.totalDowntimeMenit).toBe(90);
    expect(a2Internal.totalDowntimeMenit + a2Eksternal.totalDowntimeMenit).toBe(120);
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
  it("basis internal: semua tiket dihitung; tiket ber-vendor berhenti di titik serah terima", async () => {
    const { getSlaSummary } = await import("../slaMonitoring");
    const res = await getSlaSummary({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    expect(res.totalTiket).toBe(2);
    // 60 (A1, tanpa vendor, penuh) + 30 (A2, cuma sampai waktuLaporVendor 01:30).
    expect(res.totalDowntimeMenit).toBe(90);
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

  it("basis internal: kedua tiket ATM yang sama tetap diakumulasi (t-b2 berhenti di titik serah terima)", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla({
      dari: "2026-08-01",
      sampai: "2026-08-01",
      kategori: "semua",
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].totalTiket).toBe(2);
    // t-b1 (tanpa vendor): 60 menit penuh (01:00-02:00).
    // t-b2 (ada vendor sejak 05:00): internal CUMA 60 menit (04:00-05:00),
    // BUKAN 120 menit (04:00-06:00) — berhenti begitu diserahkan ke vendor.
    expect(res.items[0].totalDowntimeMenit).toBe(120); // 60 + 60, bukan 60+120
  });
});

// --- getSlaDrilldownTickets ---------------------------------------------------
// Satu ATM, dua tiket: satu vendor-tracked yang lolos adaBasisEksternal, satu
// tidak. Jumlah BARIS drill-down HARUS selalu cocok dengan angka yang diklik
// di dashboard (basis-aware utk mode sla-terendah — tiket N/A dikecualikan;
// basis-independent utk mode paling-bermasalah/jenis/sumber — semua tiket
// tetap tampil apa pun basisnya). Nilai DURASI/SLA% per baris ikut basis
// pilihan di SEMUA mode (toggle di halaman drill-down, ditambahkan belakangan).
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

  it("mode sla-terendah, basis eksternal: hanya tiket yang lolos adaBasisEksternal, durasi dari waktuLaporVendor", async () => {
    const { getSlaDrilldownTickets } = await import("../slaMonitoring");
    const res = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "sla-terendah",
      atmId: "atm-d1",
      basis: "eksternal",
    });
    expect(res).toHaveLength(1);
    expect(res[0].noTiket).toBe("TD-0002");
    // 04:00 - 03:15 (waktuLaporVendor) = 45 menit, BUKAN 60 (dari waktuOpen).
    expect(res[0].durasiMenit).toBe(45);
    // SLA% formula SAMA seperti getLowestSla: (totalMenitPeriode - durasi) /
    // totalMenitPeriode. Periode 1 hari = 1440 menit → (1440-45)/1440.
    expect(res[0].slaPersen).toBeCloseTo(1395 / 1440, 6);
    expect(res[0].slaPersenLabel).toMatch(/%$/);
  });

  it("mode sla-terendah, basis internal (default): TD-0002 berhenti di titik serah terima vendor", async () => {
    const { getSlaDrilldownTickets } = await import("../slaMonitoring");
    const res = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "sla-terendah",
      atmId: "atm-d1",
    });
    expect(res).toHaveLength(2);
    // TD-0001 (tanpa vendor): durasi penuh 60 menit (01:00-02:00).
    // TD-0002 (ada vendor sejak 03:15): internal CUMA 15 menit (03:00-03:15),
    // BUKAN 60 menit (03:00-04:00) — sisanya (45 menit) masuk ke eksternal,
    // lihat test basis eksternal di atas.
    expect(res.find((t) => t.noTiket === "TD-0001")!.durasiMenit).toBe(60);
    expect(res.find((t) => t.noTiket === "TD-0002")!.durasiMenit).toBe(15);
    expect(res.find((t) => t.noTiket === "TD-0001")!.slaPersen).toBeCloseTo(
      1380 / 1440,
      6
    );
    expect(res.find((t) => t.noTiket === "TD-0002")!.slaPersen).toBeCloseTo(
      1425 / 1440,
      6
    );
  });

  it("mode paling-bermasalah: JUMLAH baris basis-independent (selalu 2), TAPI durasi/SLA% ikut basis yang dipilih", async () => {
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
    // Jumlah baris TIDAK berubah oleh basis (beda dari mode sla-terendah) —
    // paling-bermasalah tetap menampilkan SEMUA tiket ATM itu apa pun basisnya.
    expect(resEksternal).toHaveLength(2);
    expect(resInternal).toHaveLength(2);

    // basis eksternal: TD-0001 (tanpa waktuLaporVendor) → durasi N/A (null),
    // BUKAN dikecualikan dari daftar seperti mode sla-terendah. TD-0002 durasi
    // dari waktuLaporVendor (45 menit, bukan 60).
    expect(resEksternal.find((t) => t.noTiket === "TD-0001")!.durasiMenit).toBeNull();
    expect(resEksternal.find((t) => t.noTiket === "TD-0002")!.durasiMenit).toBe(45);

    // basis internal (default): TD-0001 penuh (60, tanpa vendor), TD-0002
    // berhenti di titik serah terima vendor (15, BUKAN 60) — sama seperti
    // mode sla-terendah, karena downtimeMenit() satu-satunya sumber formula.
    expect(resInternal.find((t) => t.noTiket === "TD-0001")!.durasiMenit).toBe(60);
    expect(resInternal.find((t) => t.noTiket === "TD-0002")!.durasiMenit).toBe(15);
  });

  it("tiket masih 'proses' (belum ada waktuSelesai): durasiMenit null, bukan 0", async () => {
    const rowsProses = [
      {
        ...ROWS_DRILLDOWN[1],
        id: "t-d3",
        noTiket: "TD-0003",
        status: "proses",
        waktuSelesai: null,
      },
    ];
    mockRows = rowsProses;
    const { getSlaDrilldownTickets } = await import("../slaMonitoring");
    const res = await getSlaDrilldownTickets({
      ...baseFilter,
      mode: "paling-bermasalah",
      atmId: "atm-d1",
    });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("proses");
    expect(res[0].durasiMenit).toBeNull();
    expect(res[0].slaPersen).toBeNull();
    expect(res[0].slaPersenLabel).toBe("-");
  });
});

describe("basisSaatIni", () => {
  it("tanpa episode sama sekali → eksternal (keadaan sejak waktuLaporVendor pertama)", async () => {
    const { basisSaatIni } = await import("../slaMonitoring");
    expect(basisSaatIni(null)).toBe("eksternal");
  });
  it("episode terakhir basis internal → internal", async () => {
    const { basisSaatIni } = await import("../slaMonitoring");
    expect(basisSaatIni({ basis: "internal" })).toBe("internal");
  });
  it("episode terakhir basis eksternal → eksternal", async () => {
    const { basisSaatIni } = await import("../slaMonitoring");
    expect(basisSaatIni({ basis: "eksternal" })).toBe("eksternal");
  });
});

// --- Multi-episode: stop/start berkali-kali pada satu tiket ------------------
// t-multi: waktuOpen 08:00 → waktuLaporVendor 08:20 → stop#1 09:00 →
// start#1 09:30 → stop#2 11:00 → (tidak start lagi) → waktuSelesai 12:00.
// Segmen: [08:00-08:20]=internal 20 | [08:20-09:00]=eksternal 40 |
// [09:00-09:30]=internal 30 | [09:30-11:00]=eksternal 90 |
// [11:00-12:00]=internal 60 (episode terakhir, jalan sampai waktuSelesai).
// Total internal = 20+30+60 = 110. Total eksternal = 40+90 = 130. Jumlah = 240
// (= 08:00→12:00, PERSIS durasi penuh tiket — tidak ada menit yang hilang).
const ATM_MULTI = {
  id: "atm-multi",
  kodeAtm: "AM1",
  namaAtm: "ATM Multi Episode",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};

const ROWS_MULTI_EPISODE = [
  {
    id: "t-multi",
    atmId: "atm-multi",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-09-01T08:00:00+07:00"),
    waktuSelesai: new Date("2026-09-01T12:00:00+07:00"),
    noTiketVendor: "VDR-MULTI",
    waktuLaporVendor: new Date("2026-09-01T08:20:00+07:00"),
    slaEpisodes: [
      { basis: "internal", mulai: new Date("2026-09-01T09:00:00+07:00") },
      { basis: "eksternal", mulai: new Date("2026-09-01T09:30:00+07:00") },
      { basis: "internal", mulai: new Date("2026-09-01T11:00:00+07:00") },
    ],
    atm: ATM_MULTI,
  },
];

describe("downtimeMenit — multi-episode (stop/start berkali-kali)", () => {
  withRows(ROWS_MULTI_EPISODE);

  it("internal + eksternal = durasi penuh tiket, dipecah di tiap titik stop/start", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const resInternal = await getLowestSla({
      dari: "2026-09-01",
      sampai: "2026-09-01",
      kategori: "semua",
    });
    const resEksternal = await getLowestSla(
      { dari: "2026-09-01", sampai: "2026-09-01", kategori: "semua" },
      "eksternal"
    );
    expect(resInternal.items[0].totalDowntimeMenit).toBe(110);
    expect(resEksternal.items[0].totalDowntimeMenit).toBe(130);
    expect(
      resInternal.items[0].totalDowntimeMenit +
        resEksternal.items[0].totalDowntimeMenit
    ).toBe(240);
  });

  // getLowestSla di atas membuktikan mesin hitungnya benar. Test ini
  // membuktikan KONSUMEN LAIN (bukan cuma getLowestSla) benar-benar ikut
  // memakai angka yang sama — terutama getProblemReport, yang select-nya
  // (problemSelect) SEBELUM Task ini diam-diam TIDAK menyeleksi
  // waktuLaporVendor sama sekali (lihat Step 6), jadi tanpa test ini bug
  // semacam itu bisa lolos lagi tanpa ketahuan.
  it("getProblemReport (Excel 'Permasalahan') ikut basis internal sekuensial multi-episode — bukti fix problemSelect", async () => {
    const { getProblemReport } = await import("../slaMonitoring");
    const res = await getProblemReport(
      { dari: "2026-09-01", sampai: "2026-09-01", kategori: "semua" },
      "frekuensi"
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].totalDowntimeMenit).toBe(110);
  });
});
