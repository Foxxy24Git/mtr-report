import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * waktuLaporVendor dicatat OTOMATIS saat No Tiket Vendor diisi sejak Open
 * Tiket — dasar perhitungan SLA Eksternal (Lampiran IV PKS Artajasa).
 */

let createData: Record<string, unknown> | null = null;

const session = {
  sub: "user-a",
  username: "usera",
  nama: "User A",
  role: "user",
  shift: "C",
};

vi.mock("@/lib/session", () => ({ getSession: async () => session }));
vi.mock("@/lib/noTiket", () => ({
  generateUniqueNoTiket: async () => "TCK-TEST-0001",
}));
vi.mock("@/lib/ticketQueries", () => ({ listTickets: async () => [] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    atmMaster: { findUnique: async () => ({ id: "atm-1" }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        ticket: {
          create: async (args: { data: Record<string, unknown> }) => {
            createData = args.data;
            return { id: "ticket-1", noTiket: "TCK-TEST-0001" };
          },
        },
        ticketActivity: { create: async () => ({ id: "act-1" }) },
      }),
  },
}));

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tickets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  kategori: "atm",
  atmId: "atm-1",
  cpTipe: "wag",
  cpNama: "Grup WA Cabang",
  jenisGangguan: "Power Down",
  sumberPenyebab: "PLN Padam",
  metodePenanganan: "Restart",
  kegiatan: "Cek awal, ATM restart.",
};

beforeEach(() => {
  createData = null;
});

describe("POST /api/tickets — auto-catat waktuLaporVendor", () => {
  it("noTiketVendor diisi saat open → waktuLaporVendor tercatat now()", async () => {
    const { POST } = await import("../route");
    const before = Date.now();
    const res = await POST(req({ ...BASE_BODY, noTiketVendor: "VDR-001" }));
    expect(res.status).toBe(201);
    expect(createData!.noTiketVendor).toBe("VDR-001");
    const waktu = createData!.waktuLaporVendor as Date;
    expect(waktu).toBeInstanceOf(Date);
    expect(waktu.getTime()).toBeGreaterThanOrEqual(before);
    expect(waktu.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("noTiketVendor kosong saat open → waktuLaporVendor tidak diisi", async () => {
    const { POST } = await import("../route");
    const res = await POST(req(BASE_BODY));
    expect(res.status).toBe(201);
    expect(createData!.noTiketVendor).toBeNull();
    expect(createData!.waktuLaporVendor).toBeUndefined();
  });
});

describe("POST /api/tickets — waktuLaporVendor manual", () => {
  it("waktuLaporVendor manual valid di masa lalu → tersimpan persis, bukan now()", async () => {
    const { POST } = await import("../route");
    const manual = "2026-08-01T08:00:00.000Z";
    const res = await POST(
      req({ ...BASE_BODY, noTiketVendor: "VDR-002", waktuLaporVendor: manual })
    );
    expect(res.status).toBe(201);
    const waktu = createData!.waktuLaporVendor as Date;
    expect(waktu).toBeInstanceOf(Date);
    expect(waktu.getTime()).toBe(new Date(manual).getTime());
  });

  it("waktuLaporVendor manual di masa depan → 400", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      req({
        ...BASE_BODY,
        noTiketVendor: "VDR-003",
        waktuLaporVendor: "2099-01-01T00:00:00.000Z",
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/masa depan/);
    expect(createData).toBeNull();
  });
});

describe("POST /api/tickets — noTiketVendor placeholder ('-', 'n/a', 'tidak ada')", () => {
  it.each(["-", "--", "---", "n/a", "N/A", "na", "NA", "tidak ada", "Tidak Ada"])(
    "noTiketVendor = %j → dianggap kosong, waktuLaporVendor tidak tercatat",
    async (placeholder) => {
      const { POST } = await import("../route");
      const res = await POST(req({ ...BASE_BODY, noTiketVendor: placeholder }));
      expect(res.status).toBe(201);
      expect(createData!.noTiketVendor).toBeNull();
      expect(createData!.waktuLaporVendor).toBeUndefined();
    }
  );

  it("noTiketVendor nomor vendor sungguhan yang mengandung tanda hubung tetap tersimpan apa adanya", async () => {
    const { POST } = await import("../route");
    const res = await POST(req({ ...BASE_BODY, noTiketVendor: "INC-51718249" }));
    expect(res.status).toBe(201);
    expect(createData!.noTiketVendor).toBe("INC-51718249");
    expect(createData!.waktuLaporVendor).toBeInstanceOf(Date);
  });
});
