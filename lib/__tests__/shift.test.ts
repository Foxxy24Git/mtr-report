import { describe, it, expect } from "vitest";
import {
  isWeekend,
  validShiftsForDate,
  isShiftValidForDate,
  nextShift,
  WEEKDAY_SHIFTS,
  WEEKEND_SHIFTS,
} from "../shift";

// Tanggal acuan (waktu lokal):
const TUESDAY = new Date(2026, 4, 26); // 2026-05-26
const FRIDAY = new Date(2026, 4, 29); // 2026-05-29
const SATURDAY = new Date(2026, 4, 30); // 2026-05-30
const SUNDAY = new Date(2026, 4, 31); // 2026-05-31

describe("isWeekend", () => {
  it("false untuk hari kerja", () => {
    expect(isWeekend(TUESDAY)).toBe(false);
    expect(isWeekend(FRIDAY)).toBe(false);
  });
  it("true untuk Sabtu & Minggu", () => {
    expect(isWeekend(SATURDAY)).toBe(true);
    expect(isWeekend(SUNDAY)).toBe(true);
  });
});

describe("validShiftsForDate", () => {
  it("Senin–Jumat → shift A, B, C", () => {
    expect(validShiftsForDate(TUESDAY)).toEqual(WEEKDAY_SHIFTS);
    expect(validShiftsForDate(FRIDAY)).toEqual(["A", "B", "C"]);
  });
  it("Sabtu–Minggu → shift D, E", () => {
    expect(validShiftsForDate(SATURDAY)).toEqual(WEEKEND_SHIFTS);
    expect(validShiftsForDate(SUNDAY)).toEqual(["D", "E"]);
  });
});

describe("isShiftValidForDate", () => {
  it("menerima shift hari kerja yang benar", () => {
    expect(isShiftValidForDate("A", TUESDAY)).toBe(true);
    expect(isShiftValidForDate("C", TUESDAY)).toBe(true);
  });
  it("menolak shift akhir pekan di hari kerja", () => {
    expect(isShiftValidForDate("D", TUESDAY)).toBe(false);
    expect(isShiftValidForDate("E", FRIDAY)).toBe(false);
  });
  it("menerima shift akhir pekan di Sabtu/Minggu", () => {
    expect(isShiftValidForDate("D", SATURDAY)).toBe(true);
    expect(isShiftValidForDate("E", SUNDAY)).toBe(true);
  });
  it("menolak shift hari kerja di akhir pekan", () => {
    expect(isShiftValidForDate("A", SATURDAY)).toBe(false);
    expect(isShiftValidForDate("B", SUNDAY)).toBe(false);
  });
  it("menolak kode shift tak dikenal", () => {
    expect(isShiftValidForDate("Z", TUESDAY)).toBe(false);
    expect(isShiftValidForDate("", SATURDAY)).toBe(false);
  });
});

describe("nextShift", () => {
  it("siklus hari kerja A→B→C→A", () => {
    expect(nextShift("A")).toBe("B");
    expect(nextShift("B")).toBe("C");
    expect(nextShift("C")).toBe("A");
  });
  it("siklus akhir pekan D→E→D", () => {
    expect(nextShift("D")).toBe("E");
    expect(nextShift("E")).toBe("D");
  });
});
