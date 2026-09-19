import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/tickets/[id]/sla-eksternal/start — lanjutkan lagi SLA Eksternal
 * setelah sebelumnya di-stop. State machine: cuma valid kalau SAAT INI
 * sedang Internal (basisSaatIni). Tanpa body — nomor vendor yang sama
 * dipakai terus, tidak perlu diisi ulang.
 */

let createData: Record<string, unknown> | null = null;
let latestEpisode: { basis: "internal" | "eksternal" } | null = null;
let guardTicket: {
  status: "proses" | "selesai";
  waktuLaporVendor: Date | null;
};
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
        return { id: "ep-2", ...args.data };
      },
    },
  },
}));

function req() {
  return new Request("http://localhost/api/tickets/t-1/sla-eksternal/start", {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: "t-1" }) };

beforeEach(() => {
  createData = null;
  latestEpisode = { basis: "internal" }; // default: sedang di-pause
  guardTicket = {
    status: "proses",
    waktuLaporVendor: new Date("2026-09-19T08:20:00Z"),
  };
  guardResult = { ok: true, ticket: guardTicket };
});

describe("POST /api/tickets/[id]/sla-eksternal/start", () => {
  it("guardTicketMutation gagal (mis. bukan pemilik/shift-holder) → error diteruskan apa adanya", async () => {
    guardResult = {
      ok: false,
      status: 403,
      error:
        "Hanya pemilik tiket, petugas shift yang memegang tiket, atau Super Admin yang dapat mengubah tiket ini.",
    };
    const { POST } = await import("../[id]/sla-eksternal/start/route");
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/pemilik tiket/);
    expect(createData).toBeNull();
  });

  it("tiket status selesai → 409", async () => {
    guardTicket.status = "selesai";
    const { POST } = await import("../[id]/sla-eksternal/start/route");
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(createData).toBeNull();
  });

  it("tiket belum pernah lapor vendor → 409", async () => {
    guardTicket.waktuLaporVendor = null;
    const { POST } = await import("../[id]/sla-eksternal/start/route");
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(createData).toBeNull();
  });

  it("belum pernah di-stop sama sekali (0 episode, sedang Eksternal) → 409, tidak boleh start", async () => {
    latestEpisode = null;
    const { POST } = await import("../[id]/sla-eksternal/start/route");
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/status Eksternal/);
    expect(createData).toBeNull();
  });

  it("sedang Eksternal (episode terakhir basis eksternal) → 409, tidak boleh start lagi", async () => {
    latestEpisode = { basis: "eksternal" };
    const { POST } = await import("../[id]/sla-eksternal/start/route");
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(createData).toBeNull();
  });

  it("sedang Internal (habis di-stop) → berhasil, insert basis eksternal", async () => {
    const { POST } = await import("../[id]/sla-eksternal/start/route");
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(createData!.ticketId).toBe("t-1");
    expect(createData!.basis).toBe("eksternal");
    expect(createData!.dibuatOlehId).toBe("user-a");
    expect(createData!.catatan).toBeUndefined();
  });
});
