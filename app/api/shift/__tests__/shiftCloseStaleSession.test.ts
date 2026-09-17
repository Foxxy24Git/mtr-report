import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresi: sama seperti shiftHandoverStaleSession.test.ts, tapi untuk
 * "Tutup Laporan Shift" (POST /api/shift/close) — route ini punya pola kode
 * identik (lihat komentar "sama seperti serah terima" di close/route.ts)
 * sehingga rentan terhadap bug yang sama: cookie basi dari browser/tab lain
 * bisa memicu tutup laporan shift dua kali untuk shift yang sama.
 */

interface FakeTicket {
  id: string;
  status: "proses" | "selesai";
  shiftKode: "A" | "B" | "C" | "D" | "E";
  ownerUserId: string;
  waktuOpen: Date;
  supervisiId: string | null;
}

interface FakeUser {
  id: string;
  currentShift: "A" | "B" | "C" | "D" | "E" | null;
}

const SHIFT_START = new Date("2026-08-25T00:00:00Z");
// Selasa 12:00 WIB — hari kerja, dalam window Shift A (Pagi).
const WAKTU_CLOSE = new Date("2026-08-25T05:00:00Z");

let tickets: FakeTicket[] = [];
let users: FakeUser[] = [];
let activities: { ticketId: string; isTindakLanjutFlag: boolean }[] = [];
let handoversCreated = 0;
let shiftReportsCreated = 0;

function matchTicket(t: FakeTicket, where: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === "OR") {
      const branches = val as Record<string, unknown>[];
      if (!branches.some((b) => matchTicket(t, b))) return false;
      continue;
    }
    if (key === "status" || key === "shiftKode" || key === "ownerUserId") {
      const actual = (t as unknown as Record<string, unknown>)[key];
      if (actual !== val) return false;
      continue;
    }
    if (key === "waktuOpen") {
      const gte = (val as { gte?: Date }).gte;
      if (gte && t.waktuOpen.getTime() < gte.getTime()) return false;
      continue;
    }
    if (key === "activities") continue;
    throw new Error(`where key tidak didukung fake prisma: ${key}`);
  }
  return true;
}

const prismaFake = {
  ticket: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      tickets.filter((t) => matchTicket(t, where)).map((t) => ({ id: t.id })),
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
  ticketActivity: {
    createMany: async ({
      data,
    }: {
      data: { ticketId: string; isTindakLanjutFlag: boolean }[];
    }) => {
      activities.push(...data);
      return { count: data.length };
    },
  },
  acTempLog: {
    findMany: async () =>
      [1, 2, 3].map((urutan) => ({
        tanggal: "2026-08-25",
        shiftKode: "A" as const,
        urutan: urutan as 1 | 2 | 3,
        suhuRoomServer: "20°C",
        suhuPanel: "22°C",
        pantau12jamKiri: "Normal",
        pantau12jamKanan: "Normal",
      })),
  },
  serverLog: {
    findMany: async () =>
      (["awal", "akhir"] as const).map((fase) => ({
        tanggal: "2026-08-25",
        shiftKode: "A" as const,
        fase,
        npay: "Normal",
        ajAtmb: "Normal",
        bifast: "Normal",
        prima: "Normal",
        cipHost: "Normal",
      })),
  },
  shiftHandover: {
    create: async () => {
      handoversCreated += 1;
      return { id: `handover-${handoversCreated}` };
    },
  },
  shiftReport: {
    create: async () => {
      shiftReportsCreated += 1;
      return { id: `report-${shiftReportsCreated}` };
    },
  },
  user: {
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const hit = users.filter(
        (u) => u.id === where.id && u.currentShift === where.currentShift
      );
      for (const u of hit) Object.assign(u, data);
      return { count: hit.length };
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFake),
};

const session = {
  sub: "user-a",
  username: "usera",
  nama: "User A",
  role: "user",
  shift: "A",
  shiftStartedAt: SHIFT_START.toISOString(),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaFake }));
vi.mock("@/lib/session", () => ({ getSession: async () => session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock("@/lib/jwt", () => ({
  signSession: async () => "token",
  COOKIE_NAME: "session",
  SESSION_MAX_AGE: 3600,
  isSecureCookie: () => false,
}));
vi.mock("@/lib/telegramScheduler", () => ({
  notifyReportPending: async () => undefined,
}));

const BODY = {
  pimpinanInfraId: "infra-1",
  pimpinanDivisiId: "divisi-1",
  supervisiId: "supervisi-1",
  supervisiNextId: null,
};

function req(body: Record<string, unknown> = BODY) {
  return new Request("http://localhost/api/shift/close", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WAKTU_CLOSE);
  activities = [];
  handoversCreated = 0;
  shiftReportsCreated = 0;
  tickets = [
    {
      id: "t-a1",
      status: "proses",
      shiftKode: "A",
      ownerUserId: "user-a",
      waktuOpen: new Date(SHIFT_START.getTime() + 60_000),
      supervisiId: null,
    },
  ];
  users = [{ id: "user-a", currentShift: "A" }];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/shift/close — sesi shift basi (cookie dari browser/tab lain)", () => {
  it("currentShift di DB masih cocok dgn cookie → sukses seperti biasa (baseline)", async () => {
    const { POST } = await import("../close/route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(shiftReportsCreated).toBe(1);
    expect(handoversCreated).toBe(1);
    expect(users[0].currentShift).toBeNull();
  });

  it("currentShift di DB SUDAH null (shift ini sudah ditutup dari sesi lain) → ditolak 409, tidak ada handover/report/tiket baru", async () => {
    users = [{ id: "user-a", currentShift: null }];
    const { POST } = await import("../close/route");
    const res = await POST(req());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("sesi lain");
    expect(handoversCreated).toBe(0);
    expect(shiftReportsCreated).toBe(0);
    expect(activities.length).toBe(0);
    expect(tickets.find((t) => t.id === "t-a1")!.shiftKode).toBe("A");
  });
});
