import { describe, it, expect } from "vitest";
import {
  generateNoTiketCandidate,
  NO_TIKET_REGEX,
  NO_TIKET_PREFIX,
  NO_TIKET_RANDOM_LEN,
} from "../noTiket";

describe("generateNoTiketCandidate", () => {
  it("selalu cocok dengan pola BN- + 8 alfanumerik uppercase", () => {
    for (let i = 0; i < 1000; i++) {
      const no = generateNoTiketCandidate();
      expect(no).toMatch(NO_TIKET_REGEX);
    }
  });

  it("berawalan BN- dan panjang total 11", () => {
    const no = generateNoTiketCandidate();
    expect(no.startsWith(NO_TIKET_PREFIX)).toBe(true);
    expect(no.length).toBe(NO_TIKET_PREFIX.length + NO_TIKET_RANDOM_LEN);
  });

  it("tidak mengandung huruf kecil", () => {
    for (let i = 0; i < 200; i++) {
      const random = generateNoTiketCandidate().slice(NO_TIKET_PREFIX.length);
      expect(random).toBe(random.toUpperCase());
    }
  });

  it("menghasilkan nilai yang sangat bervariasi (acak)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) set.add(generateNoTiketCandidate());
    // 36^8 ruang sampel → 500 sampel praktis tak mungkin banyak bentrok.
    expect(set.size).toBeGreaterThan(490);
  });
});
