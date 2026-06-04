import { describe, it, expect } from "vitest";
import { buildLengkapSummary } from "../reportLengkapSummary";
import type { LengkapTicket } from "../reportLengkapQuery";
import { computeSla } from "../sla";

/** Tiket lengkap sintetis minimal untuk menguji agregasi ringkasan. */
function fakeTicket(over: Partial<LengkapTicket> = {}): LengkapTicket {
  const waktuOpen = new Date("2026-06-01T08:00:00+07:00");
  const waktuSelesai = new Date("2026-06-01T10:00:00+07:00"); // 120 menit
  const sla = computeSla(waktuOpen, waktuSelesai);
  return {
    tanggal: "01-06-2026",
    shiftKode: "A",
    shiftLabel: "Shift Pagi",
    petugas: "Afrinaldi",
    noTiket: "ATM-1",
    kategori: "atm",
    atmKode: "010101",
    atmNama: "ATM IBUH",
    atmLokasi: "Jl. Ibuh",
    contactPerson: "WAG",
    jenisGangguan: "ATM Offline",
    sumberPenyebab: "Listrik PLN Mati",
    metodePenanganan: "Vendor",
    vendor: "Bringin",
    noTiketVendor: "-",
    keterangan: "-",
    waktuOpen,
    waktuResponInternal: null,
    waktuSelesai,
    status: "selesai",
    activities: [],
    sla,
    slaLabel: "99.x%",
    ...over,
  } as LengkapTicket;
}

/** Tiket masih proses (belum selesai → SLA null). */
function fakeProses(over: Partial<LengkapTicket> = {}): LengkapTicket {
  const waktuOpen = new Date("2026-06-01T08:00:00+07:00");
  const sla = computeSla(waktuOpen, null);
  return fakeTicket({
    status: "proses",
    waktuSelesai: null,
    sla,
    slaLabel: "Dalam Proses",
    ...over,
  });
}

describe("buildLengkapSummary — total & kategori & status", () => {
  it("menghitung total, kategori ATM/jaringan, status selesai/proses", () => {
    const s = buildLengkapSummary([
      fakeTicket({ kategori: "atm", status: "selesai" }),
      fakeTicket({ kategori: "jaringan", status: "selesai" }),
      fakeProses({ kategori: "atm" }),
    ]);
    expect(s.total).toBe(3);
    expect(s.atm).toBe(2);
    expect(s.jaringan).toBe(1);
    expect(s.selesai).toBe(2);
    expect(s.proses).toBe(1);
  });

  it("dataset kosong → semua nol, rata-rata null, label '-'", () => {
    const s = buildLengkapSummary([]);
    expect(s.total).toBe(0);
    expect(s.avgSlaPersen).toBeNull();
    expect(s.avgLamaMenit).toBeNull();
    expect(s.avgLamaLabel).toBe("-");
  });
});

describe("buildLengkapSummary — rata-rata SLA & lama penanganan", () => {
  it("rata-rata hanya dari tiket selesai; proses diabaikan", () => {
    const open = new Date("2026-06-01T08:00:00+07:00");
    const s = buildLengkapSummary([
      // 60 menit
      fakeTicket({ sla: computeSla(open, new Date("2026-06-01T09:00:00+07:00")) }),
      // 180 menit
      fakeTicket({ sla: computeSla(open, new Date("2026-06-01T11:00:00+07:00")) }),
      // proses → diabaikan
      fakeProses(),
    ]);
    // rata-rata lama = (60 + 180) / 2 = 120 menit → "2 jam 0 menit"
    expect(s.avgLamaMenit).toBe(120);
    expect(s.avgLamaLabel).toBe("2 jam 0 menit");
    // rata-rata SLA = rata-rata dua slaPersen
    const a = computeSla(open, new Date("2026-06-01T09:00:00+07:00")).slaPersen!;
    const b = computeSla(open, new Date("2026-06-01T11:00:00+07:00")).slaPersen!;
    expect(s.avgSlaPersen).toBeCloseTo((a + b) / 2, 10);
  });

  it("format lama penanganan 'X jam Y menit' (mis. 90 menit → 1 jam 30 menit)", () => {
    const open = new Date("2026-06-01T08:00:00+07:00");
    const s = buildLengkapSummary([
      fakeTicket({ sla: computeSla(open, new Date("2026-06-01T09:30:00+07:00")) }),
    ]);
    expect(s.avgLamaMenit).toBe(90);
    expect(s.avgLamaLabel).toBe("1 jam 30 menit");
  });
});

describe("buildLengkapSummary — rekap per shift (urut A..E, semua shift)", () => {
  it("menampilkan kelima shift berurutan dengan jumlahnya (0 bila kosong)", () => {
    const s = buildLengkapSummary([
      fakeTicket({ shiftKode: "A", shiftLabel: "Shift Pagi" }),
      fakeTicket({ shiftKode: "A", shiftLabel: "Shift Pagi" }),
      fakeTicket({ shiftKode: "C", shiftLabel: "Shift Malam" }),
    ]);
    expect(s.perShift.map((x) => x.kode)).toEqual(["A", "B", "C", "D", "E"]);
    expect(s.perShift.map((x) => x.jumlah)).toEqual([2, 0, 1, 0, 0]);
    expect(s.perShift[0].label).toBe("Shift Pagi");
  });
});

describe("buildLengkapSummary — rekap per petugas (urut jumlah desc)", () => {
  it("mengelompokkan per petugas, terbanyak di atas", () => {
    const s = buildLengkapSummary([
      fakeTicket({ petugas: "Afrinaldi" }),
      fakeTicket({ petugas: "Afrinaldi" }),
      fakeTicket({ petugas: "Rian" }),
    ]);
    expect(s.perPetugas).toEqual([
      { petugas: "Afrinaldi", jumlah: 2 },
      { petugas: "Rian", jumlah: 1 },
    ]);
  });
});

describe("buildLengkapSummary — top 5 gangguan terbanyak", () => {
  it("mengembalikan maksimal 5 jenis gangguan urut jumlah desc", () => {
    const tickets: LengkapTicket[] = [];
    const counts: Record<string, number> = { G1: 5, G2: 4, G3: 3, G4: 2, G5: 1, G6: 1 };
    for (const [jenis, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) tickets.push(fakeTicket({ jenisGangguan: jenis }));
    }
    const s = buildLengkapSummary(tickets);
    expect(s.topGangguan).toHaveLength(5);
    expect(s.topGangguan.map((x) => x.jenis)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    expect(s.topGangguan[0]).toEqual({ jenis: "G1", jumlah: 5 });
  });

  it("mengabaikan gangguan kosong/'-'", () => {
    const s = buildLengkapSummary([
      fakeTicket({ jenisGangguan: "ATM Offline" }),
      fakeTicket({ jenisGangguan: "-" }),
      fakeTicket({ jenisGangguan: "" }),
    ]);
    expect(s.topGangguan).toEqual([{ jenis: "ATM Offline", jumlah: 1 }]);
  });
});
