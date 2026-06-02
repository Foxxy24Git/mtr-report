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
