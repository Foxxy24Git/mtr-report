import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Close tiket boleh memakai waktu selesai custom (backdating).
 *
 * Kasus nyata: gangguan ATM/jaringan sebenarnya beres jam 16:00, tetapi
 * petugas baru sempat menekan tombol close jam 19:00. Tanpa opsi ini, SLA di
 * laporan terhitung 3 jam lebih lama dari kenyataan.
 *
 * Aturan: body kosong → waktu saat ini (perilaku lama); string tidak valid →
 * 400; lebih awal dari waktuOpen → 400 (cegah durasi SLA negatif).
 */

const WAKTU_OPEN = new Date("2026-07-31T02:00:00Z"); // 09:00 WIB

let updateArgs: { where: unknown; data: Record<string, unknown> } | null = null;
let ticketStatus: "proses" | "selesai" = "proses";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        updateArgs = args;
        return {};
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
  guardTicketMutation: async () => ({
    ok: true,
    ticket: { id: "t-1", status: ticketStatus, waktuOpen: WAKTU_OPEN },
  }),
}));

function req(body?: Record<string, unknown>) {
  return new Request("http://localhost/api/tickets/t-1/close", {
    method: "POST",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = { params: Promise.resolve({ id: "t-1" }) };

beforeEach(() => {
  updateArgs = null;
  ticketStatus = "proses";
});

describe("POST /api/tickets/[id]/close — waktu selesai custom", () => {
  it("memakai waktu saat ini bila body kosong", async () => {
    const { POST } = await import("../[id]/close/route");
    const before = Date.now();
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const waktu = updateArgs!.data.waktuSelesai as Date;
    expect(waktu.getTime()).toBeGreaterThanOrEqual(before);
    expect(waktu.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("memakai waktu saat ini bila field dikirim kosong", async () => {
    const { POST } = await import("../[id]/close/route");
    const res = await POST(req({ waktuSelesai: "" }), params);
    expect(res.status).toBe(200);
    expect(updateArgs!.data.status).toBe("selesai");
  });

  it("menyimpan waktu selesai custom di masa lalu", async () => {
    const { POST } = await import("../[id]/close/route");
    const custom = new Date("2026-07-31T09:00:00Z"); // 16:00 WIB
    const res = await POST(req({ waktuSelesai: custom.toISOString() }), params);
    expect(res.status).toBe(200);
    expect((updateArgs!.data.waktuSelesai as Date).toISOString()).toBe(
      custom.toISOString()
    );
  });

  it("menolak waktu selesai tidak valid", async () => {
    const { POST } = await import("../[id]/close/route");
    const res = await POST(req({ waktuSelesai: "bukan tanggal" }), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Waktu selesai tidak valid.",
    });
    expect(updateArgs).toBeNull();
  });

  it("menolak waktu selesai sebelum waktu open tiket", async () => {
    const { POST } = await import("../[id]/close/route");
    const res = await POST(req({ waktuSelesai: "2026-07-31T01:00:00Z" }), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Waktu selesai tidak boleh sebelum waktu open tiket.",
    });
    expect(updateArgs).toBeNull();
  });

  it("tetap menolak tiket yang sudah selesai", async () => {
    ticketStatus = "selesai";
    const { POST } = await import("../[id]/close/route");
    const res = await POST(req({ waktuSelesai: "2026-07-31T09:00:00Z" }), params);
    expect(res.status).toBe(409);
    expect(updateArgs).toBeNull();
  });
});
