import { describe, it, expect } from "vitest";
import { buildLogbookRows, type LogbookTicketInput } from "../logbookRows";

function ticket(over: Partial<LogbookTicketInput> = {}): LogbookTicketInput {
  return {
    noTiket: "TKT-001",
    openShiftKode: "A",
    waktuOpen: new Date("2026-06-01T03:00:00Z"), // 10:00 WIB
    waktuResponInternal: null,
    cpTipe: null,
    cpNama: null,
    cpTelp: null,
    jenisGangguan: "ATM Offline",
    sumberPenyebab: "Jaringan",
    metodePenanganan: "Restart",
    vendor: "Vendor X",
    noTiketVendor: null,
    status: "selesai",
    waktuSelesai: new Date("2026-06-01T05:00:00Z"), // 12:00 WIB → 2 jam
    keterangan: null,
    atm: { kodeAtm: "ATM01", namaAtm: "Cabang Utama" },
    activities: [],
    ...over,
  };
}

describe("buildLogbookRows", () => {
  it("menomori urut & memformat tanggal/jam open dalam WIB", () => {
    const [row] = buildLogbookRows([ticket()]);
    expect(row.no).toBe(1);
    expect(row.tanggalOpen).toBe("01/06/2026");
    expect(row.waktuKejadian).toBe("10:00");
    expect(row.noTiket).toBe("TKT-001");
  });

  it("tiket selesai → Lama hh:mm & SLA pecahan; status Selesai", () => {
    const [row] = buildLogbookRows([ticket()]);
    expect(row.lama).toBe("02:00");
    expect(row.status).toBe("Selesai");
    expect(row.slaPersen).not.toBeNull();
    expect(row.slaPersen!).toBeGreaterThan(0.99);
    expect(row.waktuSelesai).toBe("01/06/2026 12:00");
  });

  it("tiket masih proses → Waktu Selesai/Lama 'Dalam Proses' & SLA null", () => {
    const [row] = buildLogbookRows([
      ticket({ status: "proses", waktuSelesai: null }),
    ]);
    expect(row.waktuSelesai).toBe("Dalam Proses");
    expect(row.lama).toBe("Dalam Proses");
    expect(row.slaPersen).toBeNull();
    expect(row.status).toBe("Dalam Proses");
  });

  it("Uraian Kegiatan memuat SELURUH kronologi termasuk tindak lanjut user lain", () => {
    const [row] = buildLogbookRows([
      ticket({
        activities: [
          { waktu: new Date("2026-06-01T03:05:00Z"), teks: "Cek awal", isTindakLanjutFlag: false },
          {
            waktu: new Date("2026-06-01T11:00:00Z"),
            teks: "TINDAK LANJUT MONITORING SELANJUTNYA",
            isTindakLanjutFlag: true,
          },
          { waktu: new Date("2026-06-01T12:30:00Z"), teks: "Ditangani vendor", isTindakLanjutFlag: false },
        ],
      }),
    ]);
    const lines = row.uraianKegiatan.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Cek awal");
    expect(lines[1]).toBe("TINDAK LANJUT MONITORING SELANJUTNYA");
    expect(lines[2]).toBe("Ditangani vendor");
    // Kolom waktu kegiatan sejajar (satu timestamp per entri).
    expect(row.waktuKegiatan.split("\n")).toHaveLength(3);
    expect(row.waktuKegiatan.split("\n")[0]).toBe("01/06 10:05");
  });

  it("contact person: WAG vs PIC (nama+telp) vs kosong", () => {
    expect(buildLogbookRows([ticket({ cpTipe: "wag" })])[0].contactPerson).toBe("WAG");
    expect(
      buildLogbookRows([ticket({ cpTipe: "pic", cpNama: "Budi", cpTelp: "0812" })])[0]
        .contactPerson
    ).toBe("Budi (0812)");
    expect(buildLogbookRows([ticket({ cpTipe: null })])[0].contactPerson).toBe("-");
  });

  it("unit kerja gabungan kode – nama ATM; '-' bila tanpa ATM", () => {
    expect(buildLogbookRows([ticket()])[0].unitKerja).toBe("ATM01 – Cabang Utama");
    expect(buildLogbookRows([ticket({ atm: null })])[0].unitKerja).toBe("-");
  });
});
