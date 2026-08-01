import { describe, it, expect } from "vitest";
import { ALL_SHIFTS, nextShift, resumableShiftSession } from "../shift";

describe("ALL_SHIFTS", () => {
  it("berisi 5 kode shift A–E", () => {
    expect(ALL_SHIFTS).toEqual(["A", "B", "C", "D", "E"]);
  });
});

describe("nextShift", () => {
  // Semua acuan waktu ditulis eksplisit dalam UTC + padanan WIB (UTC+7) agar
  // hasil tidak bergantung hari saat test dijalankan maupun TZ mesin.
  const RABU = new Date("2026-07-29T00:00:00.000Z"); // Rabu 07:00 WIB
  const SABTU = new Date("2026-08-01T00:00:00.000Z"); // Sabtu 07:00 WIB
  const MINGGU = new Date("2026-08-02T00:00:00.000Z"); // Minggu 07:00 WIB
  const SENIN = new Date("2026-08-03T00:00:00.000Z"); // Senin 07:00 WIB

  it("siklus hari kerja A→B→C→A", () => {
    expect(nextShift("A", RABU)).toBe("B");
    expect(nextShift("B", RABU)).toBe("C");
    expect(nextShift("C", RABU)).toBe("A");
  });

  it("siklus akhir pekan D→E→D", () => {
    expect(nextShift("D", SABTU)).toBe("E");
    expect(nextShift("E", SABTU)).toBe("D");
  });

  it("A, B, D tidak melewati tengah malam sehingga tujuannya tidak tergantung hari", () => {
    for (const now of [RABU, SABTU, MINGGU, SENIN]) {
      expect(nextShift("A", now)).toBe("B");
      expect(nextShift("B", now)).toBe("C");
      expect(nextShift("D", now)).toBe("E");
    }
  });

  it("C (Malam Jumat) berakhir Sabtu → masuk siklus akhir pekan (D)", () => {
    expect(nextShift("C", SABTU)).toBe("D");
  });

  it("C berakhir Minggu → tetap siklus akhir pekan (D)", () => {
    expect(nextShift("C", MINGGU)).toBe("D");
  });

  it("C berakhir di hari kerja → siklus hari kerja (A)", () => {
    expect(nextShift("C", RABU)).toBe("A");
    expect(nextShift("C", SENIN)).toBe("A");
  });

  it("E (Lembur Malam Sabtu) berakhir Minggu → tetap D", () => {
    expect(nextShift("E", MINGGU)).toBe("D");
  });

  it("E (Lembur Malam Minggu) berakhir Senin → kembali ke A", () => {
    expect(nextShift("E", SENIN)).toBe("A");
  });

  it("memakai hari WIB, bukan hari UTC", () => {
    // Jumat 18:00 UTC = Sabtu 01:00 WIB → sudah akhir pekan.
    expect(nextShift("C", new Date("2026-07-31T18:00:00.000Z"))).toBe("D");
    // Minggu 18:00 UTC = Senin 01:00 WIB → sudah hari kerja.
    expect(nextShift("E", new Date("2026-08-02T18:00:00.000Z"))).toBe("A");
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

  it("memulihkan tepat pada batas 16 jam", () => {
    const mulai = new Date("2026-07-27T00:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual({
      shift: "B",
      shiftStartedAt: "2026-07-27T00:00:00.000Z",
    });
  });

  it("kosong bila lewat 1 detik dari batas 16 jam", () => {
    const mulai = new Date("2026-07-26T23:59:59.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila sesi menggantung berhari-hari (lupa tutup shift)", () => {
    const mulai = new Date("2026-07-25T03:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });

  it("memulihkan shift D pada usia 12 jam (login ulang tepat saat serah terima)", () => {
    // Shift D ("Lembur Pagi 07:00–19:00") panjangnya tepat 12 jam — batas lama
    // (12 jam) menolak sesi ini persis di jam serah terima; batas baru (16 jam)
    // harus tetap memulihkannya.
    const mulai = new Date("2026-07-27T04:00:00.000Z");
    expect(resumableShiftSession("D", mulai, now)).toEqual({
      shift: "D",
      shiftStartedAt: "2026-07-27T04:00:00.000Z",
    });
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
