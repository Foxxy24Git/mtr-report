import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  totalMenitBulan,
  menitToHHMM,
  formatSlaPersen,
  computeSla,
} from "../sla";

describe("daysInMonth", () => {
  it("Februari tahun kabisat = 29", () => {
    expect(daysInMonth(new Date(2024, 1, 10))).toBe(29);
  });
  it("Februari non-kabisat = 28", () => {
    expect(daysInMonth(new Date(2026, 1, 10))).toBe(28);
  });
  it("Mei = 31, April = 30", () => {
    expect(daysInMonth(new Date(2026, 4, 26))).toBe(31);
    expect(daysInMonth(new Date(2026, 3, 1))).toBe(30);
  });
});

describe("totalMenitBulan", () => {
  it("bulan 30 hari = 43.200 menit", () => {
    expect(totalMenitBulan(new Date(2026, 3, 15))).toBe(43200);
  });
  it("bulan 31 hari = 44.640 menit", () => {
    expect(totalMenitBulan(new Date(2026, 4, 15))).toBe(44640);
  });
});

describe("menitToHHMM", () => {
  it("memformat menit ke hh:mm", () => {
    expect(menitToHHMM(0)).toBe("00:00");
    expect(menitToHHMM(5)).toBe("00:05");
    expect(menitToHHMM(65)).toBe("01:05");
    expect(menitToHHMM(125)).toBe("02:05");
  });
});

describe("formatSlaPersen", () => {
  it("memformat pecahan ke persen 2 desimal", () => {
    expect(formatSlaPersen(1)).toBe("100.00%");
    expect(formatSlaPersen(0.9986)).toBe("99.86%");
  });
});

describe("computeSla", () => {
  it("tiket belum selesai → Dalam Proses (semua nilai null)", () => {
    const r = computeSla(new Date(2026, 4, 1, 8, 0), null);
    expect(r.selesai).toBe(false);
    expect(r.lamaMenit).toBeNull();
    expect(r.lamaHHMM).toBeNull();
    expect(r.slaPersen).toBeNull();
    expect(r.totalMenitBulan).toBe(44640);
  });

  it("tiket selesai → hitung lama, uptime, & SLA%", () => {
    // 2 jam 5 menit gangguan di bulan Mei (31 hari).
    const open = new Date(2026, 4, 10, 8, 0, 0);
    const selesai = new Date(2026, 4, 10, 10, 5, 0);
    const r = computeSla(open, selesai);
    expect(r.selesai).toBe(true);
    expect(r.lamaMenit).toBe(125);
    expect(r.lamaHHMM).toBe("02:05");
    expect(r.totalMenitBulan).toBe(44640);
    expect(r.uptimeMenit).toBe(44640 - 125);
    expect(r.slaPersen).toBeCloseTo((44640 - 125) / 44640, 6);
  });

  it("selesai = open → lama 0 menit, SLA 100%", () => {
    const t = new Date(2026, 4, 10, 8, 0, 0);
    const r = computeSla(t, t);
    expect(r.lamaMenit).toBe(0);
    expect(r.slaPersen).toBe(1);
  });

  it("durasi negatif (data anomali) di-clamp ke 0", () => {
    const open = new Date(2026, 4, 10, 10, 0, 0);
    const selesai = new Date(2026, 4, 10, 8, 0, 0);
    expect(computeSla(open, selesai).lamaMenit).toBe(0);
  });
});
