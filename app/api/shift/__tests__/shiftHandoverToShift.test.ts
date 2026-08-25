import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresi: "Serah Terima Shift ke Shift Berikutnya" harus bisa diarahkan ke
 * shift 12 jam (D/E) saat Super Admin mengaktifkan Shift 12 Jam Override
 * (lib/shiftOverride.ts) untuk tanggal itu — sistem tidak bisa menebak sendiri
 * apakah petugas penerima akan kerja 8 jam normal atau ambil lembur 12 jam,
 * jadi tujuan tetap otomatis (nextShift) KECUALI klien mengirim `toShift`
 * eksplisit (dipilih manual di modal, hanya muncul saat override aktif).
 *
 * Bug asal: server selalu memakai nextShift(fromShift) yang buta terhadap
 * ShiftOverride — dari shift A (Pagi) tujuannya SELALU "B" (Sore), tidak
 * pernah bisa ke D/E, walau hari itu override 12 jam sedang aktif. Akibatnya
 * tiket yang diserahterimakan tersimpan di shiftKode yang tidak sesuai
 * dengan shift aktif petugas penerima yang sesungguhnya (mis. Shift Lembur
 * Malam), dan hilang dari Daily Monitoring miliknya.
 */

interface FakeTicket {
  id: string;
  status: "proses" | "selesai";
  shiftKode: "A" | "B" | "C" | "D" | "E";
  ownerUserId: string;
  waktuOpen: Date;
  supervisiId: string | null;
}

const SHIFT_START = new Date("2026-08-25T00:00:00Z");
// Selasa 12:00 WIB — hari kerja, dalam window Shift A (Pagi).
const WAKTU_HANDOVER = new Date("2026-08-25T05:00:00Z");

let tickets: FakeTicket[] = [];
let activities: { ticketId: string; isTindakLanjutFlag: boolean }[] = [];
let shiftOverrideAktif = false;
let callerBolehPilihShiftTujuan = true;

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
  shiftOverride: {
    findUnique: async () =>
      shiftOverrideAktif ? { id: "override-1" } : null,
  },
  shiftHandover: { create: async () => ({ id: "handover-1" }) },
  shiftReport: { create: async () => ({ id: "report-1" }) },
  user: {
    findUnique: async () => ({ bolehPilihShiftTujuan: callerBolehPilihShiftTujuan }),
    update: async () => ({}),
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
  receiverUserId: "user-b",
};

function req(body: Record<string, unknown> = BODY) {
  return new Request("http://localhost/api/shift/handover", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WAKTU_HANDOVER);
  activities = [];
  shiftOverrideAktif = false;
  callerBolehPilihShiftTujuan = true;
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/shift/handover — toShift manual (Shift 12 Jam Override)", () => {
  it("tanpa toShift di body → tetap otomatis (nextShift), tidak berubah dari sebelumnya", async () => {
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ toShift: "B" });
    expect(tickets.find((t) => t.id === "t-a1")!.shiftKode).toBe("B");
  });

  it("toShift='E' dikirim & override 12 jam AKTIF hari itu → dipakai apa adanya", async () => {
    shiftOverrideAktif = true;
    const { POST } = await import("../handover/route");
    const res = await POST(req({ ...BODY, toShift: "E" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ toShift: "E" });
    expect(tickets.find((t) => t.id === "t-a1")!.shiftKode).toBe("E");
  });

  it("toShift='D' dikirim tapi override TIDAK aktif → ditolak 400, tidak ada perubahan", async () => {
    shiftOverrideAktif = false;
    const { POST } = await import("../handover/route");
    const res = await POST(req({ ...BODY, toShift: "D" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tidak tersedia");
    // Tiket & aktivitas tidak boleh berubah sama sekali — request ditolak
    // sebelum transaksi handover dimulai.
    expect(tickets.find((t) => t.id === "t-a1")!.shiftKode).toBe("A");
    expect(activities.length).toBe(0);
  });

  it("toShift dikirim tapi akun TIDAK diizinkan Super Admin → ditolak 403, tidak ada perubahan", async () => {
    shiftOverrideAktif = true;
    callerBolehPilihShiftTujuan = false;
    const { POST } = await import("../handover/route");
    const res = await POST(req({ ...BODY, toShift: "E" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("izin");
    expect(tickets.find((t) => t.id === "t-a1")!.shiftKode).toBe("A");
    expect(activities.length).toBe(0);
  });
});
