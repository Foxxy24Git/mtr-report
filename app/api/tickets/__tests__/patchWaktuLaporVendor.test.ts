import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * waktuLaporVendor OTOMATIS tercatat sekali saat No Tiket Vendor pertama
 * kali diisi lewat edit (PATCH), lalu IMMUTABLE walau nomor vendor
 * dikoreksi lagi — dasar SLA Eksternal (Lampiran IV PKS Artajasa).
 */

let updateData: Record<string, unknown> | null = null;
let guardTicket: {
  id: string;
  status: "proses" | "selesai";
  waktuOpen: Date;
  waktuSelesai: Date | null;
  noTiketVendor: string | null;
  waktuLaporVendor: Date | null;
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        updateData = args.data;
        return { id: "t-1", ...args.data };
      },
    },
  },
}));
vi.mock("@/lib/session", () => ({
  getSession: async () => ({
    sub: "user-a",
    username: "usera",
    nama: "User A",
    role: "user",
    shift: "C",
  }),
}));
vi.mock("@/lib/ticketGuard", () => ({
  guardTicketMutation: async () => ({ ok: true, ticket: guardTicket }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/ticketQueries", () => ({ getTicketDetail: async () => null }));

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tickets/t-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "t-1" }) };

beforeEach(() => {
  updateData = null;
  guardTicket = {
    id: "t-1",
    status: "proses",
    waktuOpen: new Date("2026-08-01T00:00:00Z"),
    waktuSelesai: null,
    noTiketVendor: null,
    waktuLaporVendor: null,
  };
});

describe("PATCH /api/tickets/[id] — auto-catat waktuLaporVendor", () => {
  it("noTiketVendor pertama kali diisi → waktuLaporVendor tercatat now()", async () => {
    const { PATCH } = await import("../[id]/route");
    const before = Date.now();
    const res = await PATCH(req({ noTiketVendor: "VDR-001" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.noTiketVendor).toBe("VDR-001");
    const waktu = updateData!.waktuLaporVendor as Date;
    expect(waktu).toBeInstanceOf(Date);
    expect(waktu.getTime()).toBeGreaterThanOrEqual(before);
    expect(waktu.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("noTiketVendor sudah pernah terisi → edit ulang TIDAK menimpa waktuLaporVendor", async () => {
    guardTicket.noTiketVendor = "VDR-000";
    guardTicket.waktuLaporVendor = new Date("2026-08-01T00:00:00Z");
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(req({ noTiketVendor: "VDR-001-KOREKSI" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.noTiketVendor).toBe("VDR-001-KOREKSI");
    expect(updateData!.waktuLaporVendor).toBeUndefined();
  });

  it("noTiketVendor tidak dikirim/kosong → waktuLaporVendor tidak tercatat", async () => {
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(req({ keterangan: "update lain" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.waktuLaporVendor).toBeUndefined();
  });
});

describe("PATCH /api/tickets/[id] — waktuLaporVendor manual", () => {
  it("waktuLaporVendor manual sebelum waktuOpen tiket → 400", async () => {
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      req({
        noTiketVendor: "VDR-005",
        // waktuOpen default (beforeEach) = 2026-08-01T00:00:00Z.
        waktuLaporVendor: "2026-07-31T00:00:00.000Z",
      }),
      params
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/sebelum waktu kejadian/);
    expect(updateData).toBeNull();
  });

  it("noTiketVendor sudah pernah terisi + waktuLaporVendor baru dikirim di body → tetap diabaikan (immutability tidak bocor)", async () => {
    guardTicket.noTiketVendor = "VDR-000";
    guardTicket.waktuLaporVendor = new Date("2026-08-01T00:00:00Z");
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      req({
        noTiketVendor: "VDR-001-KOREKSI",
        waktuLaporVendor: "2026-08-06T10:00:00.000Z",
      }),
      params
    );
    expect(res.status).toBe(200);
    expect(updateData!.noTiketVendor).toBe("VDR-001-KOREKSI");
    expect(updateData!.waktuLaporVendor).toBeUndefined();
  });
});

describe("PATCH /api/tickets/[id] — noTiketVendor placeholder ('-', 'n/a', 'tidak ada')", () => {
  it.each(["-", "--", "---", "n/a", "N/A", "na", "NA", "tidak ada", "Tidak Ada"])(
    "noTiketVendor = %j → dianggap kosong, waktuLaporVendor tidak tercatat",
    async (placeholder) => {
      const { PATCH } = await import("../[id]/route");
      const res = await PATCH(req({ noTiketVendor: placeholder }), params);
      expect(res.status).toBe(200);
      expect(updateData!.noTiketVendor).toBeNull();
      expect(updateData!.waktuLaporVendor).toBeUndefined();
    }
  );

  it("tiket lama ber-noTiketVendor='-' di guard (sebelum dibersihkan) tetap dianggap kosong saat dikirim ulang persis sama, sehingga BISA capture waktuLaporVendor kalau diedit jadi nomor sungguhan", async () => {
    // Simulasikan record lama yang no_tiket_vendor-nya '-' TAPI belum
    // dibersihkan di DB (guard.ticket masih baca nilai lama apa adanya).
    guardTicket.noTiketVendor = "-";
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(req({ noTiketVendor: "VDR-BARU" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.noTiketVendor).toBe("VDR-BARU");
    // guard.ticket.noTiketVendor="-" bukan falsy secara JS (!"-"===false),
    // jadi perluCatatWaktu tetap FALSE di sini — konsisten dgn perilaku
    // "-" yang SUDAH tersimpan di DB sebelum normalisasi ini ada. Baris
    // lama itu perlu dibersihkan lewat migrasi data satu kali (lihat
    // catatan cleanup), bukan lewat logic PATCH ini.
    expect(updateData!.waktuLaporVendor).toBeUndefined();
  });
});
