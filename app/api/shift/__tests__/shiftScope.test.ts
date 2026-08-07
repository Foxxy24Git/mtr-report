import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresi: serah terima & tutup laporan shift TIDAK boleh menyentuh tiket
 * milik shift lain.
 *
 * Bug asal: kedua route memakai `where: { status: proses }` tanpa scoping,
 * sehingga handover User A (shift C) ikut merotasi shiftKode tiket User B yang
 * sedang di shift D. Cookie sesi User B tidak ikut di-refresh, sedangkan Daily
 * Monitoring memfilter `shiftKode = session.shift` (lib/ticketQueries.ts) —
 * akibatnya tiket User B "hilang" dari Daily Monitoring miliknya, walau tetap
 * muncul di bell/AlertDock & Weekly Monitoring yang tidak memfilter shift.
 *
 * Aturan yang berlaku: rotasi & penandaan tindak lanjut scoped per-shift,
 * yaitu hanya tiket dengan shiftKode = fromShift (shift asal pelaku handover).
 */

interface FakeActivity {
  ticketId: string;
  isTindakLanjutFlag: boolean;
}

interface FakeTicket {
  id: string;
  status: "proses" | "selesai";
  shiftKode: "A" | "B" | "C" | "D" | "E";
  ownerUserId: string;
  waktuOpen: Date;
  supervisiId: string | null;
}

const SHIFT_START = new Date("2026-07-31T00:00:00Z");

/**
 * Waktu serah terima dibekukan pada hari kerja WIB (Jumat 06:00 WIB) karena
 * tujuan shift C/E kini bergantung hari — lihat nextShift() di lib/shift.ts.
 * Berkas ini menguji *scoping* tiket, bukan aturan hari, sehingga fixture
 * C→A dipertahankan dengan mengunci jamnya agar tidak flaky di akhir pekan.
 */
const WAKTU_HANDOVER = new Date("2026-07-30T23:00:00Z");

let tickets: FakeTicket[] = [];
let activities: FakeActivity[] = [];

interface FakeAcLog {
  tanggal: string; // YYYY-MM-DD
  shiftKode: "A" | "B" | "C" | "D" | "E";
  urutan: 1 | 2 | 3;
  suhuRoomServer: string | null;
  suhuPanel: string | null;
  pantau12jamKiri: string | null;
  pantau12jamKanan: string | null;
}
interface FakeServerLog {
  tanggal: string;
  shiftKode: "A" | "B" | "C" | "D" | "E";
  fase: "awal" | "akhir";
  npay: string | null;
  ajAtmb: string | null;
  bifast: string | null;
  prima: string | null;
  cipHost: string | null;
}

let acTempLogs: FakeAcLog[] = [];
let serverLogs: FakeServerLog[] = [];

/** `tanggal` yang dikirim route sudah berupa Date (dari parseTanggal) — cocokkan via ISO date-nya saja. */
function sameTanggal(rowTanggalKey: string, whereTanggal: Date): boolean {
  return rowTanggalKey === whereTanggal.toISOString().slice(0, 10);
}

/** Cocokkan satu tiket dengan where-clause Prisma (subset yang dipakai route). */
function matchTicket(t: FakeTicket, where: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === "OR") {
      const branches = val as Record<string, unknown>[];
      if (!branches.some((b) => matchTicket(t, b))) return false;
      continue;
    }
    if (key === "status" || key === "shiftKode" || key === "ownerUserId" || key === "id") {
      const actual = (t as unknown as Record<string, unknown>)[key];
      if (val && typeof val === "object" && "in" in (val as object)) {
        if (!(val as { in: unknown[] }).in.includes(actual)) return false;
        continue;
      }
      if (actual !== val) return false;
      continue;
    }
    if (key === "waktuOpen") {
      const gte = (val as { gte?: Date }).gte;
      if (gte && t.waktuOpen.getTime() < gte.getTime()) return false;
      continue;
    }
    if (key === "activities") {
      const want = (val as { some?: { isTindakLanjutFlag?: boolean } }).some
        ?.isTindakLanjutFlag;
      if (want === undefined) continue;
      const has = activities.some(
        (a) => a.ticketId === t.id && a.isTindakLanjutFlag
      );
      if (has !== want) return false;
      continue;
    }
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
    createMany: async ({ data }: { data: FakeActivity[] }) => {
      activities.push(...data);
      return { count: data.length };
    },
  },
  acTempLog: {
    findMany: async ({ where }: { where: { tanggal: Date; shiftKode: string } }) =>
      acTempLogs.filter(
        (l) => sameTanggal(l.tanggal, where.tanggal) && l.shiftKode === where.shiftKode
      ),
  },
  serverLog: {
    findMany: async ({ where }: { where: { tanggal: Date; shiftKode: string } }) =>
      serverLogs.filter(
        (l) => sameTanggal(l.tanggal, where.tanggal) && l.shiftKode === where.shiftKode
      ),
  },
  shiftHandover: { create: async () => ({ id: "handover-1" }) },
  shiftReport: { create: async () => ({ id: "report-1" }) },
  user: { update: async () => ({}) },
  // `tx: unknown` (bukan `typeof prismaFake`) agar tidak melingkar ke dirinya
  // sendiri — route memakai tx dengan API yang sama seperti prisma.
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFake),
};

const session = {
  sub: "user-a",
  username: "usera",
  nama: "User A",
  role: "user",
  shift: "C",
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
  supervisiNextId: "supervisi-2",
  receiverUserId: "user-b",
};

function req(body: Record<string, unknown> = BODY) {
  return new Request("http://localhost/api/shift", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function punyaTindakLanjut(ticketId: string) {
  return activities.some((a) => a.ticketId === ticketId && a.isTindakLanjutFlag);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WAKTU_HANDOVER);
  activities = [];
  acTempLogs = [1, 2, 3].map((urutan) => ({
    tanggal: "2026-07-31",
    shiftKode: "C" as const,
    urutan: urutan as 1 | 2 | 3,
    suhuRoomServer: "20°C",
    suhuPanel: "22°C",
    pantau12jamKiri: "Normal",
    pantau12jamKanan: "Normal",
  }));
  serverLogs = (["awal", "akhir"] as const).map((fase) => ({
    tanggal: "2026-07-31",
    shiftKode: "C" as const,
    fase,
    npay: "Normal",
    ajAtmb: "Normal",
    bifast: "Normal",
    prima: "Normal",
    cipHost: "Normal",
  }));
  tickets = [
    // Tiket User A pada shift C (shift pelaku handover) — HARUS dirotasi.
    {
      id: "t-c1",
      status: "proses",
      shiftKode: "C",
      ownerUserId: "user-a",
      waktuOpen: new Date(SHIFT_START.getTime() + 60_000),
      supervisiId: null,
    },
    // Tiket User B yang baru dibuka di shift lembur D — TIDAK boleh tersentuh.
    {
      id: "t-d1",
      status: "proses",
      shiftKode: "D",
      ownerUserId: "user-b",
      waktuOpen: new Date(SHIFT_START.getTime() + 120_000),
      supervisiId: null,
    },
    // Tiket shift C yang sudah selesai — tidak dirotasi, hanya diikat supervisi.
    {
      id: "t-c2",
      status: "selesai",
      shiftKode: "C",
      ownerUserId: "user-a",
      waktuOpen: new Date(SHIFT_START.getTime() + 90_000),
      supervisiId: null,
    },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/shift/handover — scoping per-shift", () => {
  it("merotasi tiket shift asal (C→A) dan menandainya tindak lanjut", async () => {
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(res.status).toBe(200);

    const tc1 = tickets.find((t) => t.id === "t-c1")!;
    expect(tc1.shiftKode).toBe("A");
    expect(tc1.supervisiId).toBe("supervisi-1");
    expect(punyaTindakLanjut("t-c1")).toBe(true);
  });

  it("TIDAK menyentuh tiket shift lain (shift D milik user lain)", async () => {
    const { POST } = await import("../handover/route");
    await POST(req());

    const td1 = tickets.find((t) => t.id === "t-d1")!;
    expect(td1.shiftKode).toBe("D");
    expect(td1.supervisiId).toBeNull();
    expect(punyaTindakLanjut("t-d1")).toBe(false);
  });

  it("count hanya menghitung tiket shift asal", async () => {
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(await res.json()).toMatchObject({ ok: true, fromShift: "C", toShift: "A", count: 1 });
  });
});

describe("POST /api/shift/close — scoping per-shift", () => {
  it("menandai tindak lanjut hanya untuk tiket shift asal", async () => {
    const { POST } = await import("../close/route");
    const res = await POST(
      req({
        pimpinanInfraId: "infra-1",
        pimpinanDivisiId: "divisi-1",
        supervisiId: "supervisi-1",
        supervisiNextId: "supervisi-2",
      })
    );
    expect(res.status).toBe(200);

    expect(punyaTindakLanjut("t-c1")).toBe(true);
    expect(punyaTindakLanjut("t-d1")).toBe(false);
  });

  it("tidak merotasi shiftKode tiket manapun", async () => {
    const { POST } = await import("../close/route");
    await POST(
      req({
        pimpinanInfraId: "infra-1",
        pimpinanDivisiId: "divisi-1",
        supervisiId: "supervisi-1",
        supervisiNextId: "supervisi-2",
      })
    );

    expect(tickets.find((t) => t.id === "t-c1")!.shiftKode).toBe("C");
    expect(tickets.find((t) => t.id === "t-d1")!.shiftKode).toBe("D");
  });

  it("count hanya menghitung tiket proses shift asal", async () => {
    const { POST } = await import("../close/route");
    const res = await POST(
      req({
        pimpinanInfraId: "infra-1",
        pimpinanDivisiId: "divisi-1",
        supervisiId: "supervisi-1",
        supervisiNextId: "supervisi-2",
      })
    );
    expect(await res.json()).toMatchObject({ ok: true, shift: "C", count: 1 });
  });
});

describe("POST /api/shift/handover — wajib Suhu AC & Log Server lengkap", () => {
  it("menolak (400) jika log AC/Server shift ini belum lengkap", async () => {
    acTempLogs = [];
    serverLogs = [];
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Suhu AC pengecekan ke-1");
    expect(body.error).toContain("Log Server Awal Shift");
  });

  it("tidak membuat ShiftReport/ShiftHandover apa pun saat ditolak", async () => {
    acTempLogs = [];
    const { POST } = await import("../handover/route");
    await POST(req());
    // Tiket TIDAK dirotasi karena request ditolak sebelum transaksi jalan.
    expect(tickets.find((t) => t.id === "t-c1")!.shiftKode).toBe("C");
  });
});

describe("POST /api/shift/close — wajib Suhu AC & Log Server lengkap", () => {
  it("menolak (400) jika log AC/Server shift ini belum lengkap", async () => {
    serverLogs = [];
    const { POST } = await import("../close/route");
    const res = await POST(
      req({
        pimpinanInfraId: "infra-1",
        pimpinanDivisiId: "divisi-1",
        supervisiId: "supervisi-1",
        supervisiNextId: "supervisi-2",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Log Server Akhir Shift");
  });
});
