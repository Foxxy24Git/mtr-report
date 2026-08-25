import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresi: memilih shift BARU lewat Dashboard (ShiftSelector) TANPA serah
 * terima formal — mis. Super Admin mengaktifkan shift 12 jam di hari kerja
 * (lib/shiftOverride.ts) dan petugas pindah dari Shift Sore ke Shift Lembur
 * Malam sendiri — harus ikut memindahkan shiftKode tiket "proses" miliknya
 * dari shift lama ke shift baru.
 *
 * Bug asal: POST /api/shift hanya mengganti session.shift, tiket proses milik
 * petugas yang masih tersimpan di shiftKode lama tidak ikut pindah. Akibatnya
 * tiket itu hilang dari "Tiket Open per Shift" (lib/dashboardQueries.ts) &
 * Daily Monitoring, yang memfilter shiftKode = shift aktif sesi
 * (lib/ticketQueries.ts).
 */

interface FakeTicket {
  id: string;
  status: "proses" | "selesai";
  shiftKode: "A" | "B" | "C" | "D" | "E";
  ownerUserId: string;
  supervisiId: string | null;
}

let tickets: FakeTicket[] = [];
let currentUser: {
  currentShift: string | null;
  shiftStartedAt: Date | null;
  currentSupervisiId: string | null;
} = { currentShift: null, shiftStartedAt: null, currentSupervisiId: null };

function matchTicket(t: FakeTicket, where: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(where)) {
    const actual = (t as unknown as Record<string, unknown>)[key];
    if (val && typeof val === "object" && val !== null && "in" in (val as object)) {
      if (!(val as { in: unknown[] }).in.includes(actual)) return false;
      continue;
    }
    if (actual !== val) return false;
  }
  return true;
}

const prismaFake = {
  user: {
    findUnique: async () => ({ ...currentUser }),
    findFirst: async ({ where }: { where: { id: string } }) =>
      where.id === "supervisi-1" ? { id: "supervisi-1" } : null,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      currentUser = {
        currentShift: (data.currentShift as string | undefined) ?? null,
        shiftStartedAt: (data.shiftStartedAt as Date | undefined) ?? null,
        currentSupervisiId:
          (data.currentSupervisiId as string | null | undefined) ?? null,
      };
      return {};
    },
  },
  ticket: {
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const hit = tickets.filter((t) => matchTicket(t, where));
      for (const t of hit) Object.assign(t, data);
      return { count: hit.length };
    },
  },
};

const session = {
  sub: "user-a",
  username: "usera",
  nama: "User A",
  role: "user",
  shift: "B",
  shiftStartedAt: new Date("2026-08-25T00:00:00Z").toISOString(),
};

let shift12JamAktif = true;

vi.mock("@/lib/prisma", () => ({ prisma: prismaFake }));
vi.mock("@/lib/session", () => ({ getSession: async () => session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock("@/lib/jwt", () => ({
  signSession: async () => "token",
  COOKIE_NAME: "session",
  SESSION_MAX_AGE: 3600,
  isSecureCookie: () => false,
}));
vi.mock("@/lib/shiftOverride", () => ({
  isShift12JamAktif: async () => shift12JamAktif,
}));

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/shift", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Selasa 12:00 WIB (hari kerja) — sesuai skenario bug: override 12 jam aktif
// di hari kerja.
const WAKTU = new Date("2026-08-25T05:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WAKTU);
  shift12JamAktif = true;
  currentUser = {
    currentShift: "B",
    shiftStartedAt: new Date("2026-08-25T00:00:00Z"),
    currentSupervisiId: "supervisi-1",
  };
  tickets = [
    // Tiket proses milik petugas ini di shift lama (Sore) — HARUS ikut pindah.
    {
      id: "t-b1",
      status: "proses",
      shiftKode: "B",
      ownerUserId: "user-a",
      supervisiId: null,
    },
    // Tiket SUDAH SELESAI di shift lama — tidak boleh ikut dipindah.
    {
      id: "t-b2-selesai",
      status: "selesai",
      shiftKode: "B",
      ownerUserId: "user-a",
      supervisiId: null,
    },
    // Tiket proses shift lama milik USER LAIN — tidak boleh ikut tersentuh.
    {
      id: "t-b3-lain",
      status: "proses",
      shiftKode: "B",
      ownerUserId: "user-lain",
      supervisiId: null,
    },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/shift — migrasi tiket saat ganti shift tanpa handover", () => {
  it("memindahkan tiket proses milik petugas dari shift lama ke shift baru", async () => {
    const { POST } = await import("../route");
    const res = await POST(req({ shift: "E", supervisiId: "supervisi-1" }));
    expect(res.status).toBe(200);

    const t = tickets.find((x) => x.id === "t-b1")!;
    expect(t.shiftKode).toBe("E");
    expect(t.supervisiId).toBe("supervisi-1");
  });

  it("TIDAK memindahkan tiket yang sudah selesai", async () => {
    const { POST } = await import("../route");
    await POST(req({ shift: "E", supervisiId: "supervisi-1" }));

    expect(tickets.find((x) => x.id === "t-b2-selesai")!.shiftKode).toBe("B");
  });

  it("TIDAK memindahkan tiket proses milik user lain", async () => {
    const { POST } = await import("../route");
    await POST(req({ shift: "E", supervisiId: "supervisi-1" }));

    const t = tickets.find((x) => x.id === "t-b3-lain")!;
    expect(t.shiftKode).toBe("B");
    expect(t.supervisiId).toBeNull();
  });
});
