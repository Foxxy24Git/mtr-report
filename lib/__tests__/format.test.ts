import { describe, it, expect } from "vitest";
import { fmtDateKey } from "../format";

describe("fmtDateKey", () => {
  it("mengembalikan YYYY-MM-DD di zona WIB", () => {
    // 2026-05-26T03:00:00Z → 10:00 WIB, 26 Mei.
    expect(fmtDateKey(new Date("2026-05-26T03:00:00Z"))).toBe("2026-05-26");
  });

  it("memetakan dini hari WIB ke tanggal yang benar (bukan UTC)", () => {
    // 2026-05-26T18:30:00Z → 01:30 WIB tanggal 27 Mei (UTC+7).
    expect(fmtDateKey(new Date("2026-05-26T18:30:00Z"))).toBe("2026-05-27");
  });

  it("menerima ISO string", () => {
    expect(fmtDateKey("2026-01-01T12:00:00Z")).toBe("2026-01-01");
  });
});
