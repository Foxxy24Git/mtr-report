import { describe, it, expect } from "vitest";
import { ALL_SHIFTS, nextShift, resumableShiftSession } from "../shift";

describe("ALL_SHIFTS", () => {
  it("berisi 5 kode shift A–E", () => {
    expect(ALL_SHIFTS).toEqual(["A", "B", "C", "D", "E"]);
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

describe("resumableShiftSession", () => {
  const now = new Date("2026-07-27T16:00:00.000Z");
  const KOSONG = { shift: "", shiftStartedAt: "" };

  it("memulihkan shift yang dimulai 1 jam lalu (logout lalu login lagi)", () => {
    const mulai = new Date("2026-07-27T15:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual({
      shift: "B",
      shiftStartedAt: "2026-07-27T15:00:00.000Z",
    });
  });

  it("kosong bila petugas belum pernah memilih shift", () => {
    expect(resumableShiftSession(null, null, now)).toEqual(KOSONG);
  });

  it("kosong bila shift sudah diserahterimakan (kolom current_shift dikosongkan)", () => {
    const mulai = new Date("2026-07-27T15:00:00.000Z");
    expect(resumableShiftSession(null, mulai, now)).toEqual(KOSONG);
  });

  it("memulihkan tepat pada batas 12 jam", () => {
    const mulai = new Date("2026-07-27T04:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual({
      shift: "B",
      shiftStartedAt: "2026-07-27T04:00:00.000Z",
    });
  });

  it("kosong bila lewat 1 detik dari batas 12 jam", () => {
    const mulai = new Date("2026-07-27T03:59:59.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila sesi menggantung berhari-hari (lupa tutup shift)", () => {
    const mulai = new Date("2026-07-25T03:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila kode shift tidak dikenal", () => {
    const mulai = new Date("2026-07-27T15:00:00.000Z");
    expect(resumableShiftSession("Z", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila waktu mulai di masa depan (jam server bergeser)", () => {
    const mulai = new Date("2026-07-27T17:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });
});
