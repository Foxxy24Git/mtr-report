import { describe, it, expect } from "vitest";
import { buildReportTicketWhere } from "../reportQuery";

describe("buildReportTicketWhere", () => {
  const startWib = new Date("2026-06-01T00:00:00+07:00");
  const endWib = new Date("2026-06-02T00:00:00+07:00");

  it("memfilter shift via openShiftKode (shift asal), bukan shiftKode current", () => {
    // Inti FIX: laporan shift A harus tetap memuat tiket yang di-open pada
    // shift A walau current shiftKode tiket sudah berubah (mis. B) setelah
    // serah terima. openShiftKode bersifat immutable → kriteria yang benar.
    const where = buildReportTicketWhere({ startWib, endWib, shift: "A" });
    expect(where.openShiftKode).toBe("A");
    expect(where).not.toHaveProperty("shiftKode");
  });

  it("selalu membatasi rentang tanggal via waktuOpen", () => {
    const where = buildReportTicketWhere({ startWib, endWib });
    expect(where.waktuOpen).toEqual({ gte: startWib, lt: endWib });
  });

  it("tanpa shift → tidak memfilter shift sama sekali", () => {
    const where = buildReportTicketWhere({ startWib, endWib });
    expect(where).not.toHaveProperty("openShiftKode");
    expect(where).not.toHaveProperty("shiftKode");
  });

  it("memfilter owner hanya bila ownerUserId diberikan", () => {
    expect(
      buildReportTicketWhere({ startWib, endWib, shift: "A", ownerUserId: "u1" })
        .ownerUserId
    ).toBe("u1");
    expect(
      buildReportTicketWhere({ startWib, endWib, shift: "A" })
    ).not.toHaveProperty("ownerUserId");
  });
});
