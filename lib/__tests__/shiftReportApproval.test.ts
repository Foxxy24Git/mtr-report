import { describe, it, expect } from "vitest";
import {
  shiftPakaiSupervisiNext,
  butuhApprovalSupervisiNext,
  resolvePeranApproval,
  hitungStatusLaporan,
  labelApproval,
} from "../shiftReportApproval";

const T = new Date("2026-08-05T02:00:00Z");

describe("shiftPakaiSupervisiNext", () => {
  it("true hanya untuk shift malam C & E", () => {
    expect(shiftPakaiSupervisiNext("C")).toBe(true);
    expect(shiftPakaiSupervisiNext("E")).toBe(true);
    expect(shiftPakaiSupervisiNext("A")).toBe(false);
    expect(shiftPakaiSupervisiNext("B")).toBe(false);
    expect(shiftPakaiSupervisiNext("D")).toBe(false);
  });
});

describe("butuhApprovalSupervisiNext", () => {
  it("true untuk shift C yang punya supervisiNextId", () => {
    expect(
      butuhApprovalSupervisiNext({ shiftKode: "C", supervisiNextId: "u2" })
    ).toBe(true);
  });
  it("false untuk shift C tanpa supervisiNextId (data lama)", () => {
    expect(
      butuhApprovalSupervisiNext({ shiftKode: "C", supervisiNextId: null })
    ).toBe(false);
  });
  it("false untuk shift A walau supervisiNextId terisi (data lama)", () => {
    expect(
      butuhApprovalSupervisiNext({ shiftKode: "A", supervisiNextId: "u2" })
    ).toBe(false);
  });
});

describe("resolvePeranApproval", () => {
  const base = { shiftKode: "C", supervisiId: "u1", supervisiNextId: "u2" };
  it("mengenali supervisi utama", () => {
    expect(resolvePeranApproval(base, "u1")).toBe("utama");
  });
  it("mengenali supervisi selanjutnya", () => {
    expect(resolvePeranApproval(base, "u2")).toBe("selanjutnya");
  });
  it("mengembalikan 'keduanya' bila orang yang sama memegang dua peran", () => {
    expect(
      resolvePeranApproval(
        { shiftKode: "E", supervisiId: "u9", supervisiNextId: "u9" },
        "u9"
      )
    ).toBe("keduanya");
  });
  it("null untuk user yang tidak terkait", () => {
    expect(resolvePeranApproval(base, "u3")).toBeNull();
  });
  it("shift A: pemegang supervisiNextId lama TIDAK dapat peran", () => {
    expect(
      resolvePeranApproval(
        { shiftKode: "A", supervisiId: "u1", supervisiNextId: "u2" },
        "u2"
      )
    ).toBeNull();
  });
});

describe("hitungStatusLaporan", () => {
  it("shift A approved begitu supervisi utama approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "A",
        supervisiNextId: null,
        approvedAt: T,
        supervisiNextApprovedAt: null,
      })
    ).toBe("approved");
  });
  it("shift C tetap pending bila baru supervisi utama yang approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: null,
      })
    ).toBe("pending");
  });
  it("shift C tetap pending bila baru supervisi selanjutnya yang approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: null,
        supervisiNextApprovedAt: T,
      })
    ).toBe("pending");
  });
  it("shift C approved setelah keduanya approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: T,
      })
    ).toBe("approved");
  });
});

describe("labelApproval", () => {
  const c = { shiftKode: "C", supervisiNextId: "u2" as string | null };
  it("tanpa supervisi selanjutnya: Menunggu Approval → Sudah Diapprove", () => {
    const a = { shiftKode: "A", supervisiNextId: null };
    expect(
      labelApproval({ ...a, approvedAt: null, supervisiNextApprovedAt: null })
    ).toBe("Menunggu Approval");
    expect(
      labelApproval({ ...a, approvedAt: T, supervisiNextApprovedAt: null })
    ).toBe("Sudah Diapprove");
  });
  it("dual-gate: belum ada yang approve", () => {
    expect(
      labelApproval({ ...c, approvedAt: null, supervisiNextApprovedAt: null })
    ).toBe("Menunggu Approval");
  });
  it("dual-gate: utama sudah, selanjutnya belum", () => {
    expect(
      labelApproval({ ...c, approvedAt: T, supervisiNextApprovedAt: null })
    ).toBe("Menunggu Supervisi Selanjutnya");
  });
  it("dual-gate: selanjutnya sudah, utama belum", () => {
    expect(
      labelApproval({ ...c, approvedAt: null, supervisiNextApprovedAt: T })
    ).toBe("Menunggu Supervisi Utama");
  });
  it("dual-gate: keduanya sudah", () => {
    expect(
      labelApproval({ ...c, approvedAt: T, supervisiNextApprovedAt: T })
    ).toBe("Sudah Diapprove");
  });
});
