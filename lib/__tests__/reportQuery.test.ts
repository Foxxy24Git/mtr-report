import { describe, it, expect } from "vitest";
import { buildReportTicketWhere, filterActivitiesForShiftReport } from "../reportQuery";

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

  it("includeCarryOver tanpa shift tidak mengubah apa pun (perilaku lama)", () => {
    const where = buildReportTicketWhere({ startWib, endWib, includeCarryOver: true });
    expect(where).not.toHaveProperty("OR");
    expect(where).not.toHaveProperty("openShiftKode");
    expect(where).not.toHaveProperty("shiftKode");
    expect(where.waktuOpen).toEqual({ gte: startWib, lt: endWib });
  });

  describe("includeCarryOver: true (Download Harian — warisan tindak lanjut)", () => {
    it("menghasilkan where.OR dengan 2 klausa: tiket asli shift + warisan tindak lanjut", () => {
      const where = buildReportTicketWhere({
        startWib,
        endWib,
        shift: "A",
        includeCarryOver: true,
      });
      expect(where).not.toHaveProperty("openShiftKode");
      expect(where).not.toHaveProperty("waktuOpen");
      expect(Array.isArray(where.OR)).toBe(true);
      const or = where.OR as Record<string, unknown>[];
      expect(or).toHaveLength(2);

      // Klausa pertama: tiket asli shift ini (perilaku lama), dengan rentang waktuOpen.
      expect(or[0]).toEqual({
        waktuOpen: { gte: startWib, lt: endWib },
        openShiftKode: "A",
      });

      // Klausa kedua: warisan tindak lanjut, TANPA batas waktuOpen (mirror
      // listTickets dailyMonitoring — tiket bisa dibuka hari sebelumnya).
      expect(or[1]).toEqual({
        shiftKode: "A",
        status: "proses",
        activities: { some: { isTindakLanjutFlag: true } },
      });
    });

    it("menyertakan ownerUserId di kedua klausa OR bila diberikan", () => {
      const where = buildReportTicketWhere({
        startWib,
        endWib,
        shift: "A",
        ownerUserId: "u1",
        includeCarryOver: true,
      });
      const or = where.OR as Record<string, unknown>[];
      expect(or[0]).toMatchObject({ ownerUserId: "u1" });
      expect(or[1]).toMatchObject({ ownerUserId: "u1" });
    });
  });
});

describe("filterActivitiesForShiftReport", () => {
  const t = (h: number, m: number) => new Date(`2026-06-01T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);

  it("isCarryOver=false -> kembalikan activities apa adanya (tidak terpotong)", () => {
    const activities = [
      { waktu: t(17, 10), isTindakLanjutFlag: false },
      { waktu: t(17, 11), isTindakLanjutFlag: true },
      { waktu: t(17, 15), isTindakLanjutFlag: false },
    ];
    expect(filterActivitiesForShiftReport(activities, false)).toEqual(activities);
  });

  it("isCarryOver=true, 1 marker -> hanya activities dengan waktu >= waktu marker yang lolos", () => {
    const activities = [
      { waktu: t(17, 10), isTindakLanjutFlag: false },
      { waktu: t(17, 11), isTindakLanjutFlag: true },
      { waktu: t(17, 15), isTindakLanjutFlag: false },
    ];
    const result = filterActivitiesForShiftReport(activities, true);
    expect(result).toEqual([
      { waktu: t(17, 11), isTindakLanjutFlag: true },
      { waktu: t(17, 15), isTindakLanjutFlag: false },
    ]);
  });

  it("isCarryOver=true, tanpa marker sama sekali -> kembalikan semua (fallback defensif)", () => {
    const activities = [
      { waktu: t(17, 10), isTindakLanjutFlag: false },
      { waktu: t(17, 15), isTindakLanjutFlag: false },
    ];
    expect(filterActivitiesForShiftReport(activities, true)).toEqual(activities);
  });

  it("isCarryOver=true, 2 marker (handover 2x A->B->C) -> cutoff pakai marker TERBARU", () => {
    const activities = [
      { waktu: t(8, 0), isTindakLanjutFlag: false }, // shift A
      { waktu: t(9, 0), isTindakLanjutFlag: true }, // handover A->B
      { waktu: t(10, 0), isTindakLanjutFlag: false }, // shift B
      { waktu: t(11, 0), isTindakLanjutFlag: true }, // handover B->C
      { waktu: t(12, 0), isTindakLanjutFlag: false }, // shift C
    ];
    const result = filterActivitiesForShiftReport(activities, true);
    expect(result).toEqual([
      { waktu: t(11, 0), isTindakLanjutFlag: true },
      { waktu: t(12, 0), isTindakLanjutFlag: false },
    ]);
  });
});
