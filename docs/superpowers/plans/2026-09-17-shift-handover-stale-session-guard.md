# Shift Handover Stale-Session Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mencegah `POST /api/shift/handover` dan `POST /api/shift/close` membuat `ShiftHandover`/`ShiftReport` duplikat ketika dipanggil dari cookie sesi yang sudah basi (mis. petugas login di >1 browser/tab dan shift yang sama sudah diserahterimakan/ditutup lebih dulu dari sesi lain).

**Architecture:** Tambahkan guard atomik di awal transaksi Prisma tiap route: `tx.user.updateMany({ where: { id, currentShift: fromShift }, ... })` — hanya lanjut membuat handover/report bila baris `User` benar-benar berpindah dari `fromShift` (nilai di cookie) ke kosong. Bila `count === 0` (currentShift di DB sudah berbeda/null karena sesi lain sudah lebih dulu memprosesnya), transaksi berhenti tanpa efek samping dan route mengembalikan `409` dengan pesan yang sudah otomatis tampil di modal (state `hoErr`/`closeErr` yang sudah ada). Tidak ada perubahan skema/migrasi — perbaikan murni di application layer, memanfaatkan atomicity `UPDATE ... WHERE` Postgres sebagai lock optimistik.

**Tech Stack:** Next.js App Router API routes, Prisma (Postgres), TypeScript, Vitest (fake in-memory Prisma per test file — pola yang sudah dipakai `shiftHandoverToShift.test.ts`).

**Spec:** Tidak ada dokumen spec terpisah. Root cause berikut adalah hasil investigasi debugging pada sesi ini (root-cause investigation lengkap, dengan bukti file:line, sudah disampaikan ke user sebelum rencana ini ditulis) — ringkasannya:

- `getSession()` ([lib/session.ts](../../../lib/session.ts)) hanya *decode+verify* JWT dari cookie `mtr_session`, **tidak pernah** query ulang ke `User.currentShift` di DB.
- `POST /api/shift/handover` ([app/api/shift/handover/route.ts](../../../app/api/shift/handover/route.ts)) dan `POST /api/shift/close` ([app/api/shift/close/route.ts](../../../app/api/shift/close/route.ts)) memakai `fromShift = session.shift` (dari cookie) apa adanya, hanya divalidasi format (`ALL_SHIFTS.includes(...)`), tanpa dicocokkan ke `currentShift` DB yang sebenarnya.
- Saat handover pertama sukses di satu browser, DB `currentShift` dikosongkan dan cookie **browser itu saja** yang di-refresh. Cookie di browser/tab lain (login terpisah) tetap membawa `shift` lama.
- Bila browser kedua submit handover/close lagi, request-nya lolos semua validasi (shift lama tsb tetap format valid A–E) dan membuat `ShiftHandover` + `ShiftReport` baru dengan metadata yang identik dengan yang pertama → baris dobel di halaman Supervisi.
- `model ShiftReport` / `model ShiftHandover` di `prisma/schema.prisma` tidak punya `@@unique` yang mencegah dua baris untuk kombinasi owner+shift+hari yang sama, jadi tidak ada jaring pengaman di level DB.
- Jumlah tiket di kedua baris dobel tampak sama (bukan berlipat) karena `countTicketsForShiftDay()` ([lib/shiftReportQueries.ts](../../../lib/shiftReportQueries.ts)) menghitung ulang dari `openShiftKode + tanggal`, bukan dari `ShiftReport.id` tertentu — jadi data tiketnya sendiri aman, yang dobel murni baris laporan/approval-nya.

## Global Constraints

- Tidak ada migrasi/perubahan skema Prisma — perbaikan murni application layer.
- Tidak ada perubahan komponen client — pesan error baru otomatis tampil lewat state `hoErr`/`closeErr` yang sudah ada di [components/daily-monitoring/DailyMonitoringClient.tsx](../../../components/daily-monitoring/DailyMonitoringClient.tsx).
- Status code untuk konflik state sesi: `409` — konsisten dengan pola error "state sudah berubah" yang sudah dipakai di route lain (`app/api/tickets/[id]/close/route.ts`, `app/api/tickets/[id]/approve/route.ts`, dll), bukan `400` yang di route ini dipakai khusus utk input tidak valid.
- Pesan error dalam Bahasa Indonesia, konsisten dengan gaya pesan error lain di kedua route ini.
- Test baru mengikuti pola fake Prisma in-memory per file (bukan library mocking Prisma eksternal) — sama seperti `app/api/shift/__tests__/shiftHandoverToShift.test.ts`.
- Jangan mengubah perilaku shift 12 Jam Override / `toShift` manual / logika rotasi tiket yang sudah ada — HANYA menambah guard di awal transaksi.

---

## Task 1: Guard atomik di `POST /api/shift/handover`

**Files:**
- Modify: `app/api/shift/handover/route.ts:184-258`
- Test: `app/api/shift/__tests__/shiftHandoverStaleSession.test.ts` (baru)

**Interfaces:**
- Consumes: `ShiftKode` dari `@prisma/client` (sudah diimpor di route ini), bentuk `SessionPayload` dari `lib/jwt.ts` (tidak berubah).
- Produces: response `409` berbentuk `{ error: string }` berisi kata `"sesi lain"` saat guard menolak — dikonsumsi oleh `confirmHandover()` di `DailyMonitoringClient.tsx` yang sudah menangani `!res.ok` secara generik (tidak perlu perubahan di sana).

- [ ] **Step 1: Tulis test yang gagal (baseline + 2 skenario sesi basi)**

Buat file baru `app/api/shift/__tests__/shiftHandoverStaleSession.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresi: petugas yang login di >1 browser/tab bisa memicu serah terima
 * DUA KALI untuk shift yang sama — cookie sesi di browser kedua masih
 * membawa `shift` lama walau shift itu sudah diserahterimakan lebih dulu
 * lewat browser pertama (currentShift di DB sudah dikosongkan). Server
 * sebelumnya hanya percaya `session.shift` dari cookie tanpa mencocokkan ke
 * currentShift di DB, sehingga permintaan kedua ini lolos dan membuat
 * ShiftHandover + ShiftReport duplikat (baris dobel di halaman Supervisi).
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
const WAKTU_HANDOVER = new Date("2026-08-25T05:00:00Z");

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

describe("POST /api/shift/handover — sesi shift basi (cookie dari browser/tab lain)", () => {
  it("currentShift di DB masih cocok dgn cookie → sukses seperti biasa (baseline)", async () => {
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(shiftReportsCreated).toBe(1);
    expect(handoversCreated).toBe(1);
    expect(users[0].currentShift).toBeNull();
  });

  it("currentShift di DB SUDAH null (shift ini sudah diserahterimakan dari sesi lain) → ditolak 409, tidak ada handover/report/tiket baru", async () => {
    users = [{ id: "user-a", currentShift: null }];
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("sesi lain");
    expect(handoversCreated).toBe(0);
    expect(shiftReportsCreated).toBe(0);
    expect(activities.length).toBe(0);
    expect(tickets.find((t) => t.id === "t-a1")!.shiftKode).toBe("A");
  });

  it("currentShift di DB berubah ke shift LAIN (mis. sudah pilih shift baru) → ditolak 409, tidak ada handover/report baru", async () => {
    users = [{ id: "user-a", currentShift: "B" }];
    const { POST } = await import("../handover/route");
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(handoversCreated).toBe(0);
    expect(shiftReportsCreated).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `./node_modules/.bin/vitest run app/api/shift/__tests__/shiftHandoverStaleSession.test.ts`
Expected: FAIL — baseline test gagal dengan error `tx.user.updateMany is not a function` (kode produksi masih pakai `tx.user.update`), atau test skenario basi gagal karena route belum punya guard (status 200 bukan 409).

- [ ] **Step 3: Tambahkan guard atomik di route**

Di `app/api/shift/handover/route.ts`, ganti blok transaksi (baris 184-258):

```ts
  const report = await prisma.$transaction(async (tx) => {
    const handover = await tx.shiftHandover.create({
```

...sampai...

```ts
    await tx.user.update({
      where: { id: session.sub },
      data: { currentShift: null, shiftStartedAt: null, currentSupervisiId: null },
    });

    return shiftReport;
  });
```

menjadi:

```ts
  const result = await prisma.$transaction(async (tx) => {
    // Jaga atomik: cookie sesi ("session.shift") bisa basi bila petugas
    // login di >1 browser/tab dan shift ini SUDAH diserahterimakan/ditutup
    // lewat sesi lain — currentShift di DB sudah null (atau berubah) walau
    // cookie sesi ini masih membawa nilai lama. Tanpa guard ini, permintaan
    // dari cookie basi lolos & membuat ShiftHandover + ShiftReport duplikat
    // untuk shift yang sama (root cause dobel approval di Supervisi).
    // updateMany dgn where currentShift = fromShift atomik di level DB:
    // hanya SATU request yang bisa "menang" walau dikirim bersamaan.
    const guarded = await tx.user.updateMany({
      where: { id: session.sub, currentShift: fromShift as ShiftKode },
      data: { currentShift: null, shiftStartedAt: null, currentSupervisiId: null },
    });
    if (guarded.count === 0) {
      return { ok: false as const };
    }

    const handover = await tx.shiftHandover.create({
      data: {
        fromUserId: session.sub,
        toUserId: receiverUserId,
        fromShift: fromShift as ShiftKode,
        toShift,
        pimpinanInfraId,
        pimpinanDivisiId,
        supervisiId,
        supervisiNextId: supervisiNextFinal,
      },
    });

    // Tiket yang SUDAH selesai (close) pada shift ini juga diikat ke supervisi
    // pilihan modal (PRD revisi §3): supervisi dapat melihatnya & sudah final.
    // Tiket proses memperoleh supervisiId pada updateMany handover di bawah.
    await tx.ticket.updateMany({
      where: {
        status: TicketStatus.selesai,
        shiftKode: fromShift as ShiftKode,
        OR: shiftScopeOR,
      },
      data: { supervisiId },
    });

    if (openTickets.length > 0) {
      // Penanda dicatat di shift yang ditutup, sebelum entri shift baru.
      await tx.ticketActivity.createMany({
        data: openTickets.map((t) => ({
          ticketId: t.id,
          userId: session.sub,
          shiftKode: fromShift as ShiftKode,
          teks: TINDAK_LANJUT_TEKS,
          isTindakLanjutFlag: true,
        })),
      });
      // Setiap tiket di-handover diikat ke supervisi pilihan modal (PRD revisi
      // §2/§3): supervisi tsb yang berhak meng-approve tiket ini nantinya.
      await tx.ticket.updateMany({
        where: {
          status: TicketStatus.proses,
          shiftKode: fromShift as ShiftKode,
        },
        data: { shiftKode: toShift, supervisiId },
      });
    }

    // 1 shift = 1 laporan (PART 2): dibuat saat serah terima, status pending.
    // Laporan tetap dibuat walau shift tanpa gangguan (tidak ada tiket).
    const shiftReport = await tx.shiftReport.create({
      data: {
        tanggal: new Date(),
        shiftKode: fromShift as ShiftKode,
        shiftLabel: getShiftLabel(fromShift),
        ownerUserId: session.sub,
        receiverUserId,
        supervisiId,
        supervisiNextId: supervisiNextFinal,
        pimpinanInfraId,
        pimpinanDivisiId,
        handoverId: handover.id,
      },
    });

    return { ok: true as const, shiftReport };
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "Shift ini sudah diserahterimakan/ditutup dari sesi lain. Muat ulang halaman untuk menyinkronkan status shift Anda.",
      },
      { status: 409 }
    );
  }
  const report = result.shiftReport;
```

Baris-baris setelah blok transaksi (`await notifyReportPending(report.id);`, pembuatan `token`, `store.set(...)`, `return NextResponse.json({ ok: true, ... })`) **tidak berubah** — tetap memakai variabel `report` seperti sebelumnya, sekarang berasal dari `result.shiftReport`.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `./node_modules/.bin/vitest run app/api/shift/__tests__/shiftHandoverStaleSession.test.ts`
Expected: PASS — 3/3 test lulus.

- [ ] **Step 5: Jalankan seluruh suite shift untuk pastikan tidak ada regresi**

Run: `./node_modules/.bin/vitest run app/api/shift`
Expected: PASS — termasuk `shiftHandoverToShift.test.ts`, `shiftMigration.test.ts`, `shiftScope.test.ts` yang sudah ada sebelumnya.

- [ ] **Step 6: Commit**

```bash
git add app/api/shift/handover/route.ts app/api/shift/__tests__/shiftHandoverStaleSession.test.ts
git commit -m "$(cat <<'EOF'
fix(shift): cegah handover duplikat dari sesi/cookie shift yang basi

Sebelumnya POST /api/shift/handover hanya percaya session.shift dari
cookie tanpa mencocokkan ke currentShift di DB, sehingga petugas yang
login di >1 browser bisa memicu serah terima dua kali untuk shift yang
sama dan membuat baris ShiftReport duplikat di halaman Supervisi.
Tambahkan guard atomik (updateMany bersyarat) di awal transaksi.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Guard atomik di `POST /api/shift/close`

**Files:**
- Modify: `app/api/shift/close/route.ts:125-181`
- Test: `app/api/shift/__tests__/shiftCloseStaleSession.test.ts` (baru)

**Interfaces:**
- Consumes: sama seperti Task 1 (`ShiftKode` dari `@prisma/client`, `SessionPayload`).
- Produces: response `409` `{ error: string }` berisi kata `"sesi lain"` — dikonsumsi oleh `confirmCloseShift()` di `DailyMonitoringClient.tsx` (state `closeErr` sudah menangani ini, tidak perlu perubahan).

Route ini punya pola kode yang identik dengan `handover/route.ts` (disebutkan eksplisit di komentarnya: *"sama seperti serah terima"*) dan rentan terhadap kerentanan **yang sama persis** — belum diamati langsung di laporan bug Anda, tapi terbukti lewat pembacaan kode (baris 172-178 `close/route.ts` melakukan `tx.user.update` tanpa syarat, identik dengan bug di Task 1). Direkomendasikan diperbaiki bersamaan agar tidak jadi bug laten yang muncul lain waktu dengan gejala sama. Beri tahu saya kalau Anda ingin skip task ini.

- [ ] **Step 1: Tulis test yang gagal (baseline + skenario sesi basi)**

Buat file baru `app/api/shift/__tests__/shiftCloseStaleSession.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `./node_modules/.bin/vitest run app/api/shift/__tests__/shiftCloseStaleSession.test.ts`
Expected: FAIL — baseline gagal (`tx.user.updateMany is not a function`) atau skenario basi gagal (status 200 bukan 409).

- [ ] **Step 3: Tambahkan guard atomik di route**

Di `app/api/shift/close/route.ts`, ganti blok transaksi (baris 125-181):

```ts
  const report = await prisma.$transaction(async (tx) => {
    const handover = await tx.shiftHandover.create({
```

...sampai...

```ts
    await tx.user.update({
      where: { id: session.sub },
      data: { currentShift: null, shiftStartedAt: null, currentSupervisiId: null },
    });

    return shiftReport;
  });
```

menjadi:

```ts
  const result = await prisma.$transaction(async (tx) => {
    // Jaga atomik: sama seperti app/api/shift/handover/route.ts — lihat
    // penjelasan lengkap di sana. Cookie sesi bisa basi bila petugas login
    // di >1 browser/tab dan shift ini sudah ditutup/diserahterimakan lebih
    // dulu lewat sesi lain.
    const guarded = await tx.user.updateMany({
      where: { id: session.sub, currentShift: fromShift as ShiftKode },
      data: { currentShift: null, shiftStartedAt: null, currentSupervisiId: null },
    });
    if (guarded.count === 0) {
      return { ok: false as const };
    }

    const handover = await tx.shiftHandover.create({
      data: {
        fromUserId: session.sub,
        toUserId: null,
        fromShift: fromShift as ShiftKode,
        toShift: fromShift as ShiftKode,
        pimpinanInfraId,
        pimpinanDivisiId,
        supervisiId,
        supervisiNextId: supervisiNextFinal,
      },
    });

    // Ikat seluruh tiket shift ini (proses & selesai) ke supervisi pilihan.
    await tx.ticket.updateMany({
      where: { shiftKode: fromShift as ShiftKode, OR: shiftScopeOR },
      data: { supervisiId },
    });

    if (openTickets.length > 0) {
      await tx.ticketActivity.createMany({
        data: openTickets.map((t) => ({
          ticketId: t.id,
          userId: session.sub,
          shiftKode: fromShift as ShiftKode,
          teks: TINDAK_LANJUT_TEKS,
          isTindakLanjutFlag: true,
        })),
      });
    }

    const shiftReport = await tx.shiftReport.create({
      data: {
        tanggal: new Date(),
        shiftKode: fromShift as ShiftKode,
        shiftLabel: getShiftLabel(fromShift),
        ownerUserId: session.sub,
        receiverUserId: null,
        supervisiId,
        supervisiNextId: supervisiNextFinal,
        pimpinanInfraId,
        pimpinanDivisiId,
        handoverId: handover.id,
      },
    });

    return { ok: true as const, shiftReport };
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "Shift ini sudah ditutup/diserahterimakan dari sesi lain. Muat ulang halaman untuk menyinkronkan status shift Anda.",
      },
      { status: 409 }
    );
  }
  const report = result.shiftReport;
```

Baris setelahnya (`notifyReportPending`, `signSession`, `store.set`, `return NextResponse.json(...)`) tidak berubah, tetap memakai `report` (sekarang dari `result.shiftReport`).

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `./node_modules/.bin/vitest run app/api/shift/__tests__/shiftCloseStaleSession.test.ts`
Expected: PASS — 2/2 test lulus.

- [ ] **Step 5: Jalankan seluruh suite shift untuk pastikan tidak ada regresi**

Run: `./node_modules/.bin/vitest run app/api/shift`
Expected: PASS — semua file test di folder ini (termasuk Task 1) lulus.

- [ ] **Step 6: Commit**

```bash
git add app/api/shift/close/route.ts app/api/shift/__tests__/shiftCloseStaleSession.test.ts
git commit -m "$(cat <<'EOF'
fix(shift): cegah tutup laporan shift duplikat dari sesi yang basi

Pola bug identik dengan handover (commit sebelumnya): POST
/api/shift/close juga cuma percaya session.shift dari cookie tanpa
mencocokkan ke currentShift di DB. Terapkan guard atomik yang sama.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verifikasi akhir (setelah kedua task selesai)

- [ ] Jalankan seluruh test suite proyek: `./node_modules/.bin/vitest run`
  Expected: semua test PASS, tidak ada regresi di luar folder `app/api/shift`.
- [ ] Jalankan type-check: `./node_modules/.bin/tsc --noEmit`
  Expected: tidak ada error tipe baru (khususnya di kedua route yang diubah — pastikan `result.ok` ter-narrow dengan benar oleh TypeScript sebelum mengakses `result.shiftReport`).
- [ ] Uji manual (opsional tapi direkomendasikan mengingat ini bug lintas-sesi): buka 2 browser berbeda, login sebagai user yang sama, pilih shift yang sama di keduanya, lakukan serah terima di browser 1 (harus sukses), lalu coba serah terima lagi di browser 2 tanpa refresh (harus muncul pesan error 409 "sudah diserahterimakan dari sesi lain", dan tidak ada baris baru di halaman Supervisi).
