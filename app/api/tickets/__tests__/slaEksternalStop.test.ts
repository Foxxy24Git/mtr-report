import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/tickets/[id]/sla-eksternal/stop — hentikan sementara SLA
 * Eksternal, kembali ke Internal. State machine: cuma valid kalau SAAT INI
 * sedang Eksternal (basisSaatIni). catatan opsional.
 */

let createData: Record<string, unknown> | null = null;
let latestEpisode: { basis: "internal" | "eksternal" } | null = null;
let guardTicket: {
  status: "proses" | "selesai";
  waktuLaporVendor: Date | null;
};
// Hasil guardTicketMutation yang dipakai tiap test — default sukses
// (di-reset tiap beforeEach). Test guard-gagal menimpa ini langsung.
let guardResult:
  | { ok: true; ticket: typeof guardTicket }
  | { ok: false; status: number; error: string };

const session = {
  sub: "user-a",
  username: "usera",
  nama: "User A",
  role: "user",
  shift: "C",
};

vi.mock("@/lib/session", () => ({ getSession: async () => session }));
vi.mock("@/lib/ticketGuard", () => ({
  guardTicketMutation: async () => guardResult,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticketSlaEpisode: {
      findFirst: async () => latestEpisode,
      create: async (args: { data: Record<string, unknown> }) => {
        createData = args.data;
        return { id: "ep-1", ...args.data };
      },
    },
  },
}));

function req(body?: Record<string, unknown>) {
  return new Request("http://localhost/api/tickets/t-1/sla-eksternal/stop", {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = { params: Promise.resolve({ id: "t-1" }) };

beforeEach(() => {
  createData = null;
  latestEpisode = null; // default: belum pernah stop → sedang Eksternal
  guardTicket = {
    status: "proses",
    waktuLaporVendor: new Date("2026-09-19T08:20:00Z"),
  };
  guardResult = { ok: true, ticket: guardTicket };
});

describe("POST /api/tickets/[id]/sla-eksternal/stop", () => {
  it("guardTicketMutation gagal (mis. bukan pemilik/shift-holder) → error diteruskan apa adanya", async () => {
    guardResult = {
      ok: false,
      status: 403,
      error:
        "Hanya pemilik tiket, petugas shift yang memegang tiket, atau Super Admin yang dapat mengubah tiket ini.",
    };
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({}), params);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/pemilik tiket/);
    expect(createData).toBeNull();
  });

  it("tiket status selesai → 409", async () => {
    guardTicket.status = "selesai";
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({}), params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/Proses/);
    expect(createData).toBeNull();
  });

  it("tiket belum pernah lapor vendor → 409", async () => {
    guardTicket.waktuLaporVendor = null;
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({}), params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/belum pernah lapor/);
    expect(createData).toBeNull();
  });

  it("sedang Internal (episode terakhir basis internal) → 409, tidak boleh stop lagi", async () => {
    latestEpisode = { basis: "internal" };
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({}), params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/status Internal/);
    expect(createData).toBeNull();
  });

  it("belum pernah stop sama sekali (0 episode) → berhasil, insert basis internal", async () => {
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({ catatan: "PIC vendor tidak bisa dihubungi" }), params);
    expect(res.status).toBe(200);
    expect(createData!.ticketId).toBe("t-1");
    expect(createData!.basis).toBe("internal");
    expect(createData!.catatan).toBe("PIC vendor tidak bisa dihubungi");
    expect(createData!.dibuatOlehId).toBe("user-a");
  });

  it("sedang Eksternal lagi (habis di-start sebelumnya) → berhasil stop lagi", async () => {
    latestEpisode = { basis: "eksternal" };
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({}), params);
    expect(res.status).toBe(200);
    expect(createData!.basis).toBe("internal");
  });

  it("catatan tidak dikirim → tersimpan null (opsional, bukan wajib)", async () => {
    const { POST } = await import("../[id]/sla-eksternal/stop/route");
    const res = await POST(req({}), params);
    expect(res.status).toBe(200);
    expect(createData!.catatan).toBeNull();
  });
});
