import { describe, it, expect } from "vitest";
import { getShiftLabel, resolveShiftReportSignatures } from "../shiftReport";

describe("getShiftLabel", () => {
  it("returns the full label for a known shift", () => {
    expect(getShiftLabel("A")).toBe("Shift Pagi (07:00–15:00)");
  });
  it("falls back to 'Shift X' for unknown", () => {
    expect(getShiftLabel("Z")).toBe("Shift Z");
  });
});

describe("resolveShiftReportSignatures", () => {
  const base = {
    shiftKode: "A" as string,
    ownerUser: { nama: "Owner A", ttdUrl: "/ttd/a.png" },
    receiverUser: { nama: "Recv B", ttdUrl: "/ttd/b.png" },
    supervisi: { nama: "Sup C", ttdUrl: "/ttd/c.png" },
    pimpinanInfra: { nama: "Infra", tipe: "tetap" as const, namaPjs: null },
    pimpinanDivisi: {
      nama: "Divisi PJS",
      tipe: "pjs" as const,
      namaPjs: "Pengganti D",
    },
    status: "pending" as const,
  };

  it("hides supervisi TTD while pending but keeps the name", () => {
    const s = resolveShiftReportSignatures(base);
    expect(s.supervisi).toBe("Sup C");
    expect(s.supervisiTtdPath).toBeNull();
    expect(s.supervisiApproved).toBe(false);
  });
  it("shows supervisi TTD once approved", () => {
    const s = resolveShiftReportSignatures({ ...base, status: "approved" });
    expect(s.supervisiTtdPath).toBe("/ttd/c.png");
    expect(s.supervisiApproved).toBe(true);
  });
  it("prints PJS name for pjs leaders, tetap name otherwise", () => {
    const s = resolveShiftReportSignatures(base);
    expect(s.pimpinanInfra).toBe("Infra");
    expect(s.pimpinanDivisi).toBe("Pengganti D");
  });
  it("uses owner as sender and receiver as penerima", () => {
    const s = resolveShiftReportSignatures(base);
    expect(s.penyerah).toBe("Owner A");
    expect(s.penyerahTtdPath).toBe("/ttd/a.png");
    expect(s.penerima).toBe("Recv B");
    expect(s.penerimaTtdPath).toBe("/ttd/b.png");
  });
  it("handles a closed shift without receiver", () => {
    const s = resolveShiftReportSignatures({ ...base, receiverUser: null });
    expect(s.penerima).toBe("");
    expect(s.penerimaTtdPath).toBeNull();
  });
});

describe("resolveShiftReportSignatures — supervisi selanjutnya (shift C/E)", () => {
  const baseC = {
    shiftKode: "C",
    ownerUser: { nama: "Owner A", ttdUrl: "/ttd/a.png" },
    receiverUser: { nama: "Recv B", ttdUrl: "/ttd/b.png" },
    supervisi: { nama: "Sup C", ttdUrl: "/ttd/c.png" },
    supervisiNext: { nama: "Sup Next", ttdUrl: "/ttd/next.png" },
    supervisiNextId: "u2",
    pimpinanInfra: { nama: "Infra", tipe: "tetap" as const, namaPjs: null },
    pimpinanDivisi: { nama: "Divisi", tipe: "tetap" as const, namaPjs: null },
    approvedAt: null as Date | null,
    supervisiNextApprovedAt: null as Date | null,
    status: "pending" as const,
  };
  const T = new Date("2026-08-05T02:00:00Z");

  it("menampilkan blok kolom L hanya untuk shift C & E", () => {
    expect(resolveShiftReportSignatures(baseC).showSupervisiNext).toBe(true);
    expect(
      resolveShiftReportSignatures({ ...baseC, shiftKode: "E" }).showSupervisiNext
    ).toBe(true);
    expect(
      resolveShiftReportSignatures({ ...baseC, shiftKode: "A" }).showSupervisiNext
    ).toBe(false);
  });

  it("nama supervisi selanjutnya tampil walau belum approve, TTD-nya null", () => {
    const s = resolveShiftReportSignatures(baseC);
    expect(s.supervisiNext).toBe("Sup Next");
    expect(s.supervisiNextApproved).toBe(false);
    expect(s.supervisiNextTtdPath).toBeNull();
  });

  it("TTD supervisi selanjutnya muncul setelah supervisiNextApprovedAt terisi", () => {
    const s = resolveShiftReportSignatures({
      ...baseC,
      supervisiNextApprovedAt: T,
    });
    expect(s.supervisiNextApproved).toBe(true);
    expect(s.supervisiNextTtdPath).toBe("/ttd/next.png");
  });

  it("REGRESI: TTD supervisi utama tetap tampil saat status masih pending karena menunggu supervisi selanjutnya", () => {
    const s = resolveShiftReportSignatures({
      ...baseC,
      approvedAt: T,
      supervisiNextApprovedAt: null,
      status: "pending",
    });
    expect(s.supervisiApproved).toBe(true);
    expect(s.supervisiTtdPath).toBe("/ttd/c.png");
  });

  it("tanpa approvedAt, gate TTD utama jatuh kembali ke status (data lama)", () => {
    const s = resolveShiftReportSignatures({
      shiftKode: "A",
      ownerUser: { nama: "O", ttdUrl: null },
      supervisi: { nama: "S", ttdUrl: "/ttd/s.png" },
      status: "approved",
    });
    expect(s.supervisiApproved).toBe(true);
    expect(s.supervisiTtdPath).toBe("/ttd/s.png");
  });

  it("blok L kosong (data lama tanpa supervisiNext) tetap ditampilkan", () => {
    const s = resolveShiftReportSignatures({
      ...baseC,
      supervisiNext: null,
      supervisiNextId: null,
    });
    expect(s.showSupervisiNext).toBe(true);
    expect(s.supervisiNext).toBe("");
    expect(s.supervisiNextTtdPath).toBeNull();
  });
});
