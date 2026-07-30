import { describe, it, expect } from "vitest";
import { estimateWrappedLines } from "../excelReportLengkap";

/**
 * `estimateWrappedLines` menentukan berapa baris visual satu paragraf kegiatan
 * memakan tempat setelah wrapText. Angkanya dipakai BARENGAN untuk tinggi baris
 * DAN padding kolom jam (M di rekap lengkap, K di laporan harian), jadi tiap
 * kesalahan hitung satu entri menggeser SEMUA jam sesudahnya di baris tiket yang
 * sama — drift-nya kumulatif.
 *
 * Excel mem-wrap di batas kata (greedy), bukan memotong tiap N karakter. Test di
 * bawah mengunci perilaku itu: kasus-kasus "gagal di heuristik char-count" adalah
 * paragraf yang jumlah karakternya membuat `Math.ceil(len / charsPerLine)`
 * meleset dari hasil word-wrap sesungguhnya.
 */
describe("estimateWrappedLines", () => {
  it("teks kosong / whitespace saja tetap 1 baris", () => {
    expect(estimateWrappedLines("", 32)).toBe(1);
    expect(estimateWrappedLines("   ", 32)).toBe(1);
  });

  it("paragraf lebih pendek dari lebar kolom = 1 baris", () => {
    expect(estimateWrappedLines("Cek koneksi ATM.", 32)).toBe(1);
  });

  it("newline eksplisit dihitung sebagai paragraf terpisah", () => {
    expect(estimateWrappedLines("Baris satu.\nBaris dua.", 32)).toBe(2);
    // Paragraf kosong di tengah tetap menyumbang 1 baris.
    expect(estimateWrappedLines("a\n\nb", 32)).toBe(3);
  });

  describe("kasus yang meleset di heuristik char-count rata", () => {
    it("UNDER-estimate: ragged loss antar kata menambah baris", () => {
      // 20 karakter / 10 = 2 baris menurut char-count, padahal tiap "abcdef"
      // (6) + spasi tak bisa dipasangkan dalam 10 kolom → 3 baris.
      expect(estimateWrappedLines("abcdef abcdef abcdef", 10)).toBe(3);

      // Kasus nyata pada lebar kolom N (32): 56 karakter → char-count bilang 2.
      const teks = "komunikasi ATM petugas pengecekan menunggu ATM belum ke.";
      expect(Math.ceil(teks.length / 32)).toBe(2); // yang lama
      expect(estimateWrappedLines(teks, 32)).toBe(3); // yang benar
    });

    it("OVER-estimate: kata-kata yang pas ternyata butuh lebih sedikit baris", () => {
      // 65 karakter → char-count bilang 3, padahal greedy word-wrap muat 2 baris
      // ("dilakukan Koordinasi di dispatch" = tepat 32, sisanya 32).
      const teks = "dilakukan Koordinasi di dispatch perangkat konfirmasi komunikasi.";
      expect(Math.ceil(teks.length / 32)).toBe(3); // yang lama
      expect(estimateWrappedLines(teks, 32)).toBe(2); // yang benar
    });

    it("drift kumulatif: paragraf panjang dengan banyak kata", () => {
      const teks =
        "Koordinasi restart belum pengecekan terputus dan pengecekan restart komunikasi ke.";
      expect(Math.ceil(teks.length / 32)).toBe(3); // yang lama
      expect(estimateWrappedLines(teks, 32)).toBe(4); // yang benar
    });
  });

  describe("kata lebih panjang dari lebar kolom (Excel memotong di tengah kata)", () => {
    it("satu kata sangat panjang dipecah, tidak 0 baris & tidak menggantung", () => {
      // "*" sengaja dipakai (bukan huruf) karena bobotnya tepat 1.0 (default,
      // tidak ada di CHAR_WEIGHTS) — supaya angka batas di sini tidak lagi
      // terikat lebar spesifik satu huruf.
      expect(estimateWrappedLines("*".repeat(32), 32)).toBe(1);
      expect(estimateWrappedLines("*".repeat(64), 32)).toBe(2);
      expect(estimateWrappedLines("*".repeat(70), 32)).toBe(3);
      expect(estimateWrappedLines("*".repeat(33), 32)).toBe(2);
    });

    it("kata panjang di tengah paragraf tidak menelan kata sesudahnya", () => {
      // "aa" + kata 40 char + "bb": kata panjang mengisi 2 baris (sisa 8),
      // "bb" masih muat di sisa baris kedua → 3 baris total.
      expect(estimateWrappedLines(`aa ${"y".repeat(40)} bb`, 32)).toBe(3);
    });

    it("selalu >= 1 baris untuk input apa pun (tidak pernah 0 / infinite)", () => {
      for (const s of ["a", "z".repeat(500), "a b c", "\n", "\n\n"]) {
        const n = estimateWrappedLines(s, 32);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(n)).toBe(true);
      }
    });
  });

  it("monoton: menyempitkan kolom tidak boleh mengurangi jumlah baris", () => {
    const teks =
      "Koordinasi dengan vendor Bringin untuk pengecekan perangkat EDC di lokasi cabang Payakumbuh.";
    for (let n = 20; n < 40; n++) {
      expect(estimateWrappedLines(teks, n)).toBeLessThanOrEqual(
        estimateWrappedLines(teks, n - 1)
      );
    }
  });
});
