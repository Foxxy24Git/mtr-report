import { describe, it, expect } from "vitest";
import { ALL_SHIFTS, nextShift } from "../shift";

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
