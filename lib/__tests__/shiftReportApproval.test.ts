import { describe, it, expect } from "vitest";
import {
  shiftPakaiSupervisiNext,
  butuhApprovalSupervisiNext,
  resolvePeranApproval,
  hitungStatusLaporan,
  labelApproval,
  cekKonflikApproval,
  susunPatchApproval,
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

describe("cekKonflikApproval", () => {
  it("peran utama, approvedAt masih kosong → bukan konflik", () => {
    expect(
      cekKonflikApproval("utama", {
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: null,
        supervisiNextApprovedAt: null,
      })
    ).toBe(false);
  });

  it("peran utama, approvedAt sudah terisi → konflik", () => {
    expect(
      cekKonflikApproval("utama", {
        shiftKode: "A",
        supervisiNextId: null,
        approvedAt: T,
        supervisiNextApprovedAt: null,
      })
    ).toBe(true);
  });

  it("peran selanjutnya, supervisiNextApprovedAt masih kosong → bukan konflik", () => {
    expect(
      cekKonflikApproval("selanjutnya", {
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: null,
      })
    ).toBe(false);
  });

  it("peran selanjutnya, supervisiNextApprovedAt sudah terisi → konflik", () => {
    expect(
      cekKonflikApproval("selanjutnya", {
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: T,
      })
    ).toBe(true);
  });

  it("peran keduanya, kedua kolom masih kosong → bukan konflik", () => {
    expect(
      cekKonflikApproval("keduanya", {
        shiftKode: "E",
        supervisiNextId: "u9",
        approvedAt: null,
        supervisiNextApprovedAt: null,
      })
    ).toBe(false);
  });

  it("peran keduanya, kedua kolom sudah terisi → konflik", () => {
    expect(
      cekKonflikApproval("keduanya", {
        shiftKode: "E",
        supervisiNextId: "u9",
        approvedAt: T,
        supervisiNextApprovedAt: T,
      })
    ).toBe(true);
  });
});

describe("susunPatchApproval", () => {
  const NOW = new Date("2026-08-05T03:30:00Z");

  it("peran utama approve kolom kosong (shift C): patch isi kolom utama saja, status tetap pending karena kolom selanjutnya belum ada", () => {
    const patch = susunPatchApproval(
      "utama",
      {
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: null,
        supervisiNextApprovedAt: null,
      },
      "u1",
      "catatan utama",
      NOW
    );
    expect(patch.approvedAt).toBe(NOW);
    expect(patch.approvedById).toBe("u1");
    expect(patch.catatanSupervisi).toBe("catatan utama");
    expect(patch.supervisiNextApprovedAt).toBeUndefined();
    expect(patch.status).toBe("pending");
  });

  it("peran selanjutnya approve kolom kosong (utama sudah approve duluan): patch isi kolom selanjutnya, status jadi approved", () => {
    const patch = susunPatchApproval(
      "selanjutnya",
      {
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: null,
      },
      "u2",
      "catatan lanjutan",
      NOW
    );
    expect(patch.supervisiNextApprovedAt).toBe(NOW);
    expect(patch.supervisiNextApprovedById).toBe("u2");
    expect(patch.catatanSupervisiNext).toBe("catatan lanjutan");
    expect(patch.approvedAt).toBeUndefined();
    expect(patch.status).toBe("approved");
  });

  it("peran keduanya approve pertama kali (shift E): satu panggilan isi KEDUA set kolom, status langsung approved", () => {
    const patch = susunPatchApproval(
      "keduanya",
      {
        shiftKode: "E",
        supervisiNextId: "u9",
        approvedAt: null,
        supervisiNextApprovedAt: null,
      },
      "u9",
      "catatan gabungan",
      NOW
    );
    expect(patch.approvedAt).toBe(NOW);
    expect(patch.approvedById).toBe("u9");
    expect(patch.catatanSupervisi).toBe("catatan gabungan");
    expect(patch.supervisiNextApprovedAt).toBe(NOW);
    expect(patch.supervisiNextApprovedById).toBe("u9");
    expect(patch.catatanSupervisiNext).toBe("catatan gabungan");
    expect(patch.status).toBe("approved");
  });

  it("shift A/B/D (tidak butuh approval kedua): peran utama approve → status langsung approved walau supervisiNextApprovedAt tidak pernah diisi", () => {
    const patch = susunPatchApproval(
      "utama",
      {
        shiftKode: "A",
        supervisiNextId: null,
        approvedAt: null,
        supervisiNextApprovedAt: null,
      },
      "u1",
      null,
      NOW
    );
    expect(patch.approvedAt).toBe(NOW);
    expect(patch.approvedById).toBe("u1");
    expect(patch.supervisiNextApprovedAt).toBeUndefined();
    expect(patch.status).toBe("approved");
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
