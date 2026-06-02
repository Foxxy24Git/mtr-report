import { describe, it, expect } from "vitest";
import { resolveSender, resolveAcknowledger, resolveLeaderName } from "../reportSignatures";

describe("resolveSender (C26 — Petugas Monitoring yang menyerahkan)", () => {
  it("ambil nama + TTD dari owner tiket pertama, TTD ADA walau belum serah terima", () => {
    // Inti FIX PART 3: laporan yang di-download sebelum handover tetap
    // menampilkan TTD penyerah (dari owner awal shift), bukan kosong.
    const r = resolveSender(
      { nama: "mtr1", ttdUrl: "/ttd/mtr1.png" },
      null,
      "fallback"
    );
    expect(r).toEqual({ nama: "mtr1", ttdPath: "/ttd/mtr1.png" });
  });

  it("owner tiket pertama diprioritaskan walau ada handover", () => {
    const r = resolveSender(
      { nama: "mtr1", ttdUrl: "/ttd/mtr1.png" },
      { nama: "mtr3", ttdUrl: "/ttd/mtr3.png" },
      "fallback"
    );
    expect(r).toEqual({ nama: "mtr1", ttdPath: "/ttd/mtr1.png" });
  });

  it("owner pertama tanpa TTD → nama tetap dia, ttdPath null (tidak meminjam TTD orang lain)", () => {
    const r = resolveSender(
      { nama: "mtr1", ttdUrl: null },
      { nama: "mtr3", ttdUrl: "/ttd/mtr3.png" },
      "fallback"
    );
    expect(r).toEqual({ nama: "mtr1", ttdPath: null });
  });

  it("tanpa tiket → fallback ke penyerah handover", () => {
    const r = resolveSender(null, { nama: "mtr2", ttdUrl: "/ttd/mtr2.png" }, "fallback");
    expect(r).toEqual({ nama: "mtr2", ttdPath: "/ttd/mtr2.png" });
  });

  it("tanpa tiket & tanpa handover → fallback nama, tanpa TTD", () => {
    const r = resolveSender(null, null, "mtr1 / mtr3");
    expect(r).toEqual({ nama: "mtr1 / mtr3", ttdPath: null });
  });
});

describe("resolveAcknowledger (O26/R26 — Pimpinan Infra & Divisi)", () => {
  it("pakai pimpinan pilihan handover bila ada", () => {
    expect(resolveAcknowledger("Pak Infra", "")).toBe("Pak Infra");
  });

  it("fallback ke pimpinan tingkat tiket bila belum handover", () => {
    expect(resolveAcknowledger("", "Pak A / Pak B")).toBe("Pak A / Pak B");
  });

  it("SEBELUM serah terima & tanpa pimpinan tiket → KOSONG (tidak ada default)", () => {
    // Keputusan PART 4: O26/R26 kosong sampai dipilih saat serah terima.
    expect(resolveAcknowledger("", "")).toBe("");
    expect(resolveAcknowledger(null, null)).toBe("");
  });
});

describe("resolveLeaderName (PART 5 — nama dicetak di O26/R26)", () => {
  it("tipe tetap → tulis nama pimpinan", () => {
    expect(resolveLeaderName({ nama: "Budi Santoso", tipe: "tetap" })).toBe(
      "Budi Santoso"
    );
  });

  it("tipe pjs → tulis nama_pjs (nama pengganti, bukan nama pimpinan asli)", () => {
    expect(
      resolveLeaderName({ nama: "Budi Santoso", tipe: "pjs", namaPjs: "Andi Wijaya" })
    ).toBe("Andi Wijaya");
  });

  it("null/undefined → string kosong", () => {
    expect(resolveLeaderName(null)).toBe("");
    expect(resolveLeaderName(undefined)).toBe("");
  });

  it("pjs tanpa nama_pjs → kosong (tidak meminjam nama pimpinan)", () => {
    expect(resolveLeaderName({ nama: "Budi", tipe: "pjs", namaPjs: null })).toBe("");
  });
});
