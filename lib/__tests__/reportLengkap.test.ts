import { describe, it, expect } from "vitest";
import {
  buildLengkapTicketWhere,
  computeLengkapRange,
  mapLengkapTicket,
  slaLabel,
  type LengkapTicketRow,
} from "../reportLengkapQuery";
import { computeSla, formatSlaPersen } from "../sla";

describe("computeLengkapRange", () => {
  it("mencakup penuh tanggal 'sampai' (BETWEEN inklusif → end eksklusif H+1)", () => {
    const { startWib, endWib } = computeLengkapRange("2026-06-01", "2026-06-03");
    expect(startWib).toEqual(new Date("2026-06-01T00:00:00+07:00"));
    expect(endWib).toEqual(new Date("2026-06-04T00:00:00+07:00"));
  });
});

describe("buildLengkapTicketWhere", () => {
  const range = computeLengkapRange("2026-06-01", "2026-06-03");

  it("memfilter rentang via createdAt", () => {
    expect(buildLengkapTicketWhere(range).createdAt).toEqual({
      gte: range.startWib,
      lt: range.endWib,
    });
  });

  it("TANPA filter owner & TANPA filter shift (ambil semua tiket)", () => {
    const where = buildLengkapTicketWhere(range);
    expect(where).not.toHaveProperty("ownerUserId");
    expect(where).not.toHaveProperty("openShiftKode");
    expect(where).not.toHaveProperty("shiftKode");
  });
});

describe("slaLabel", () => {
  it("tiket proses (belum selesai) → 'Dalam Proses'", () => {
    const sla = computeSla(new Date("2026-06-01T08:00:00+07:00"), null);
    expect(slaLabel(sla)).toBe("Dalam Proses");
  });

  it("tiket selesai → persen SLA", () => {
    const sla = computeSla(
      new Date("2026-06-01T08:00:00+07:00"),
      new Date("2026-06-01T10:00:00+07:00")
    );
    expect(slaLabel(sla)).toBe(formatSlaPersen(sla.slaPersen!));
  });
});

/** Baris Prisma sintetis untuk menguji mapper tanpa DB. */
function fakeRow(over: Partial<LengkapTicketRow> = {}): LengkapTicketRow {
  return {
    id: "t1",
    noTiket: "ATM-20260601-001",
    kategori: "atm",
    atmId: "a1",
    waktuOpen: new Date("2026-06-01T08:00:00+07:00"),
    waktuResponInternal: new Date("2026-06-01T08:05:00+07:00"),
    cpTipe: null,
    cpNama: null,
    cpTelp: null,
    jenisGangguan: "ATM Offline",
    sumberPenyebab: "Listrik PLN Mati",
    metodePenanganan: "Penanganan gangguan oleh vendor ATM",
    vendor: "Bringin",
    noTiketVendor: "VND-1",
    status: "selesai",
    waktuSelesai: new Date("2026-06-01T10:00:00+07:00"),
    statusSupervisi: "belum",
    approvedById: null,
    approvedAt: null,
    pimpinanInfraId: null,
    pimpinanDivisiId: null,
    supervisiId: null,
    // Penanda kritis: current shiftKode = "B" (sudah handover) TAPI laporan
    // wajib memakai openShiftKode = "A" (shift asal).
    shiftKode: "B",
    openShiftKode: "A",
    ownerUserId: "u1",
    keterangan: null,
    createdAt: new Date("2026-06-01T08:00:00+07:00"),
    atm: { kodeAtm: "010101", namaAtm: "ATM IBUH", cabang: "PYK", alamat: "Jl. Ibuh No.1" },
    owner: { nama: "Kurnia Fajri" },
    activities: [
      {
        id: "act1",
        teks: "Cek koneksi ATM.",
        waktu: new Date("2026-06-01T08:20:00+07:00"),
        isTindakLanjutFlag: false,
        user: { nama: "Kurnia Fajri" },
      },
      {
        id: "act2",
        teks: "ATM kembali online.",
        waktu: new Date("2026-06-01T10:00:00+07:00"),
        isTindakLanjutFlag: true,
        user: { nama: "Rian Putra" },
      },
    ],
    ...over,
  } as unknown as LengkapTicketRow;
}

describe("mapLengkapTicket", () => {
  it("menambahkan kolom penanda gabungan (tanggal, shift asal, petugas)", () => {
    const t = mapLengkapTicket(fakeRow());
    expect(t.tanggal).toBe("01-06-2026");
    // openShiftKode "A" (asal), BUKAN shiftKode current "B".
    expect(t.shiftKode).toBe("A");
    expect(t.shiftLabel).toBe("Shift Pagi");
    expect(t.petugas).toBe("Kurnia Fajri");
  });

  it("memetakan ATM (lokasi pakai alamat) & kegiatan urut waktu", () => {
    const t = mapLengkapTicket(fakeRow());
    expect(t.atmKode).toBe("010101");
    expect(t.atmLokasi).toBe("Jl. Ibuh No.1");
    expect(t.activities).toHaveLength(2);
    expect(t.activities[1]).toMatchObject({ petugas: "Rian Putra", isTindakLanjut: true });
  });

  it("tiket selesai → SLA persen; tiket proses → 'Dalam Proses' & waktuSelesai null", () => {
    expect(mapLengkapTicket(fakeRow()).slaLabel).toMatch(/%$/);

    const proses = mapLengkapTicket(
      fakeRow({ status: "proses", waktuSelesai: null } as Partial<LengkapTicketRow>)
    );
    expect(proses.slaLabel).toBe("Dalam Proses");
    expect(proses.waktuSelesai).toBeNull();
  });
});
