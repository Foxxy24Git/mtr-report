import { describe, it, expect } from "vitest";
import { matchShiftsForDate } from "@/lib/reportShiftLookup";

describe("matchShiftsForDate", () => {
  it("1 ShiftReport cocok jendela nominal shift -> 1 match, live:false", () => {
    const matches = matchShiftsForDate(
      "2026-08-03",
      [{ shiftKode: "A", tanggal: new Date("2026-08-03T15:00:00+07:00") }],
      null
    );
    expect(matches).toEqual([{ shift: "A", live: false }]);
  });

  it("tutup TERLAMBAT tapi masih dalam SHIFT_RESUME_MAX_AGE_MS -> tetap match", () => {
    // Shift A mulai 07:00, nominal selesai 15:00, tapi baru ditutup 22:00
    // (15 jam setelah mulai) -- masih < 16 jam toleransi.
    const matches = matchShiftsForDate(
      "2026-08-03",
      [{ shiftKode: "A", tanggal: new Date("2026-08-03T22:00:00+07:00") }],
      null
    );
    expect(matches).toEqual([{ shift: "A", live: false }]);
  });

  it("tutup lebih dari SHIFT_RESUME_MAX_AGE_MS setelah mulai -> TIDAK match", () => {
    // Shift A mulai 07:00; 16 jam kemudian = 23:00 -- batas eksklusif.
    // Ditutup 23:30 sudah melewati toleransi.
    const matches = matchShiftsForDate(
      "2026-08-03",
      [{ shiftKode: "A", tanggal: new Date("2026-08-03T23:30:00+07:00") }],
      null
    );
    expect(matches).toEqual([]);
  });

  it("tidak ada ShiftReport & tidak ada liveSession -> []", () => {
    expect(matchShiftsForDate("2026-08-03", [], null)).toEqual([]);
  });

  it("liveSession currentShift+shiftStartedAt di tanggal yang DIMINTA -> 1 match live:true", () => {
    const matches = matchShiftsForDate("2026-08-03", [], {
      currentShift: "B",
      shiftStartedAt: new Date("2026-08-03T15:10:00+07:00"),
    });
    expect(matches).toEqual([{ shift: "B", live: true }]);
  });

  it("liveSession ada tapi shiftStartedAt di tanggal LAIN -> tidak match", () => {
    const matches = matchShiftsForDate("2026-08-03", [], {
      currentShift: "B",
      shiftStartedAt: new Date("2026-08-04T15:10:00+07:00"),
    });
    expect(matches).toEqual([]);
  });

  it("2 ShiftReport shift berbeda di tanggal sama (kasus jarang/ambigu) -> 2 match", () => {
    const matches = matchShiftsForDate(
      "2026-08-03",
      [
        { shiftKode: "A", tanggal: new Date("2026-08-03T15:00:00+07:00") },
        { shiftKode: "C", tanggal: new Date("2026-08-04T06:00:00+07:00") },
      ],
      null
    );
    expect(matches).toEqual([
      { shift: "A", live: false },
      { shift: "C", live: false },
    ]);
  });

  it("liveSession currentShift SAMA dengan salah satu closedReports yang sudah match -> tidak dobel", () => {
    const matches = matchShiftsForDate(
      "2026-08-03",
      [{ shiftKode: "B", tanggal: new Date("2026-08-03T23:00:00+07:00") }],
      {
        currentShift: "B",
        shiftStartedAt: new Date("2026-08-03T15:10:00+07:00"),
      }
    );
    expect(matches).toEqual([{ shift: "B", live: false }]);
  });
});
