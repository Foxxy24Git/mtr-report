# Shift Report Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the approval paradigm from per-ticket approval to per-shift-report approval: supervisi approves an entire shift report (not individual tickets), and the supervisi signature on the Excel report is gated on `ShiftReport.status === "approved"`.

**Architecture:** A new `ShiftReport` row is created automatically on every shift handover (and on manual "Tutup Laporan Shift"). The Supervisi menu, dashboard, monitoring "Status Supervisi" columns, and Excel signature block all read from `ShiftReport` instead of `tickets.statusSupervisi`. The old ticket-approval columns stay in the schema but are no longer read (decision: keep-unused, safer).

**Tech Stack:** Next 15 (App Router, server components), Prisma 6 + PostgreSQL, ExcelJS, Tailwind v3, Vitest (pure-function tests only — no DB integration tests in this repo).

**Decisions locked with user:**
- "Tutup Laporan Shift": always visible as a secondary button when the user has an active shift (system has no shift-time schedule). Creates a `ShiftReport` with `receiverUserId = null`.
- PART 5 cleanup: keep `tickets.statusSupervisi/approvedById/approvedAt` columns + `StatusSupervisi` enum in schema but stop reading them; remove only the per-ticket approve UI/route usage.

**Conventions in this repo:**
- Prisma fields are camelCase with `@map("snake_case")`; tables use `@@map`.
- Pure logic → `lib/*.ts` with Vitest tests in `lib/__tests__/`. DB queries live in `lib/*Queries.ts` / `lib/reportData.ts` and are not unit-tested.
- Report ticket scoping uses `openShiftKode` (immutable) + `waktuOpen` day-range (see `lib/reportQuery.ts`).
- Migrations: hand-named SQL dirs under `prisma/migrations/` applied via `./node_modules/.bin/prisma migrate dev --name <name>` (RTK hook can break `npx`; use local bin).

---

## File Structure

**Create:**
- `lib/shiftReport.ts` — pure helpers: `getShiftLabel`, `resolveShiftReportSignatures` (testable). No DB.
- `lib/shiftReportQueries.ts` — DB queries: `listShiftReports`, `getShiftReportDetail`, `getShiftReportTicketCount`, `getSupervisiShiftReportDashboard`, `attachShiftReportStatus`.
- `lib/__tests__/shiftReport.test.ts` — unit tests for the pure helpers.
- `app/api/shift/close/route.ts` — manual "Tutup Laporan Shift" (no receiver).
- `app/api/shift-reports/route.ts` — `GET` filtered list for Supervisi menu (status + date range).
- `app/api/shift-reports/[id]/approve/route.ts` — `POST` approve a shift report.
- `components/supervisi/ShiftReportListClient.tsx` — Supervisi list (replaces ticket list).
- `components/supervisi/ShiftReportDetailClient.tsx` — detail + approve + catatan.
- `app/(app)/supervisi/[id]/page.tsx` — REPLACE contents (shift-report detail, not ticket detail).

**Modify:**
- `prisma/schema.prisma` — add `ShiftReport` model + relations.
- `app/api/shift/handover/route.ts` — create `ShiftReport` in the transaction; extract shared create helper.
- `lib/reportData.ts` — signatures from `ShiftReport` (fallback to current logic).
- `lib/dashboardQueries.ts` — `getSupervisiDashboardData` reads pending `ShiftReport`s.
- `components/dashboard/SupervisiDashboardClient.tsx` + `SupervisiMetricCards.tsx` + `SupervisiDayTicketList.tsx` — shift-report wording/data.
- `app/api/dashboard/supervisi/route.ts` — return new shape.
- `lib/ticketQueries.ts` — `listTickets`/`listWeeklyTickets` attach shift-report-derived supervisi status.
- `components/daily-monitoring/DailyMonitoringClient.tsx` — add "Tutup Laporan Shift" button + supervisi column wording.
- `components/weekly-monitoring/WeeklyMonitoringClient.tsx` — supervisi column from shift report.
- `components/daily-monitoring/TicketDetailClient.tsx` — remove per-ticket approve button.
- `app/(app)/supervisi/page.tsx` — render shift-report list.

---

## Task 1: Add `ShiftReport` model + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model + relation back-refs.** Insert after the `ShiftHandover` model. Use camelCase fields with `@map`, mirroring repo convention.

```prisma
// Laporan per shift (paradigma approval baru): 1 shift = 1 record. Dibuat
// otomatis saat serah terima ATAU "Tutup Laporan Shift". Supervisi approve di
// level laporan ini (bukan per tiket); TTD supervisi di Excel di-gate status.
model ShiftReport {
  id              String    @id @default(cuid())
  tanggal         DateTime  // instant saat shift ditutup (dipakai untuk day-range WIB)
  shiftKode       ShiftKode @map("shift_kode")
  shiftLabel      String    @map("shift_label")
  ownerUserId     String    @map("owner_user_id")
  receiverUserId  String?   @map("receiver_user_id")
  supervisiId     String?   @map("supervisi_id")
  supervisiNextId String?   @map("supervisi_next_id")
  pimpinanInfraId String?   @map("pimpinan_infra_id")
  pimpinanDivisiId String?  @map("pimpinan_divisi_id")
  status          String    @default("pending") // pending | approved
  approvedAt      DateTime? @map("approved_at")
  approvedById    String?   @map("approved_by")
  catatanSupervisi String?  @map("catatan_supervisi")
  handoverId      String?   @map("handover_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  ownerUser      User    @relation("ShiftReportOwner", fields: [ownerUserId], references: [id])
  receiverUser   User?   @relation("ShiftReportReceiver", fields: [receiverUserId], references: [id])
  supervisi      User?   @relation("ShiftReportSupervisi", fields: [supervisiId], references: [id])
  supervisiNext  User?   @relation("ShiftReportSupervisiNext", fields: [supervisiNextId], references: [id])
  approver       User?   @relation("ShiftReportApprover", fields: [approvedById], references: [id])
  pimpinanInfra  Leader? @relation("ShiftReportPimpinanInfra", fields: [pimpinanInfraId], references: [id])
  pimpinanDivisi Leader? @relation("ShiftReportPimpinanDivisi", fields: [pimpinanDivisiId], references: [id])
  handover       ShiftHandover? @relation(fields: [handoverId], references: [id])

  @@index([shiftKode, tanggal])
  @@index([supervisiId, status])
  @@map("shift_reports")
}
```

- [ ] **Step 2: Add back-relation arrays.** On `model User` add:

```prisma
  shiftReportsOwned        ShiftReport[] @relation("ShiftReportOwner")
  shiftReportsReceived     ShiftReport[] @relation("ShiftReportReceiver")
  shiftReportsSupervisi    ShiftReport[] @relation("ShiftReportSupervisi")
  shiftReportsSupervisiNext ShiftReport[] @relation("ShiftReportSupervisiNext")
  shiftReportsApproved     ShiftReport[] @relation("ShiftReportApprover")
```

On `model Leader` add:

```prisma
  shiftReportsInfra  ShiftReport[] @relation("ShiftReportPimpinanInfra")
  shiftReportsDivisi ShiftReport[] @relation("ShiftReportPimpinanDivisi")
```

On `model ShiftHandover` add:

```prisma
  shiftReports ShiftHandover[] // placeholder — see correction below
```

> CORRECTION: handover→report is one-to-many from the report side; on `ShiftHandover` add `shiftReports ShiftReport[]` (NOT self-referential). Final line on `ShiftHandover`:
> ```prisma
>   shiftReports ShiftReport[]
> ```

- [ ] **Step 3: Generate migration + client.**

Run: `./node_modules/.bin/prisma migrate dev --name shift_reports`
Expected: new migration dir created, `shift_reports` table created, Prisma Client regenerated, exit 0.

- [ ] **Step 4: Typecheck.**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no new errors (existing baseline only).

- [ ] **Step 5: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(shift-report): add ShiftReport model + migration"
```

---

## Task 2: Pure helpers `lib/shiftReport.ts` (TDD)

**Files:**
- Create: `lib/shiftReport.ts`
- Test: `lib/__tests__/shiftReport.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
import { describe, it, expect } from "vitest";
import { getShiftLabel, resolveShiftReportSignatures } from "../shiftReport";

describe("getShiftLabel", () => {
  it("returns the full label for a known shift", () => {
    expect(getShiftLabel("A")).toBe("Shift Pagi (07:00–15:00)");
  });
  it("falls back to 'Shift X' for unknown", () => {
    expect(getShiftLabel("Z")).toBe("Shift Z");
  });
});

describe("resolveShiftReportSignatures", () => {
  const base = {
    ownerUser: { nama: "Owner A", ttdUrl: "/ttd/a.png" },
    receiverUser: { nama: "Recv B", ttdUrl: "/ttd/b.png" },
    supervisi: { nama: "Sup C", ttdUrl: "/ttd/c.png" },
    pimpinanInfra: { nama: "Infra", tipe: "tetap" as const, namaPjs: null },
    pimpinanDivisi: { nama: "Divisi PJS", tipe: "pjs" as const, namaPjs: "Pengganti D" },
    status: "pending" as const,
  };

  it("hides supervisi TTD while pending but keeps the name", () => {
    const s = resolveShiftReportSignatures(base);
    expect(s.supervisi).toBe("Sup C");
    expect(s.supervisiTtdPath).toBeNull();
    expect(s.supervisiApproved).toBe(false);
  });
  it("shows supervisi TTD once approved", () => {
    const s = resolveShiftReportSignatures({ ...base, status: "approved" });
    expect(s.supervisiTtdPath).toBe("/ttd/c.png");
    expect(s.supervisiApproved).toBe(true);
  });
  it("prints PJS name for pjs leaders, tetap name otherwise", () => {
    const s = resolveShiftReportSignatures(base);
    expect(s.pimpinanInfra).toBe("Infra");
    expect(s.pimpinanDivisi).toBe("Pengganti D");
  });
  it("uses owner as sender and receiver as penerima", () => {
    const s = resolveShiftReportSignatures(base);
    expect(s.penyerah).toBe("Owner A");
    expect(s.penyerahTtdPath).toBe("/ttd/a.png");
    expect(s.penerima).toBe("Recv B");
    expect(s.penerimaTtdPath).toBe("/ttd/b.png");
  });
});
```

- [ ] **Step 2: Run, verify red.** Run: `npm test -- shiftReport`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**

```ts
import { SHIFT_LABELS } from "@/lib/constants";
import { resolveLeaderName, type LeaderRef } from "@/lib/reportSignatures";

export function getShiftLabel(shift: string): string {
  return SHIFT_LABELS[shift] ?? `Shift ${shift}`;
}

export interface ShiftReportSignerInput {
  ownerUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  receiverUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisi?: { nama?: string | null; ttdUrl?: string | null } | null;
  pimpinanInfra?: LeaderRef | null;
  pimpinanDivisi?: LeaderRef | null;
  status: string;
}

export interface ShiftReportSignatures {
  penyerah: string;
  penyerahTtdPath: string | null;
  penerima: string;
  penerimaTtdPath: string | null;
  supervisi: string;
  supervisiApproved: boolean;
  supervisiTtdPath: string | null;
  pimpinanInfra: string;
  pimpinanDivisi: string;
}

export function resolveShiftReportSignatures(
  r: ShiftReportSignerInput
): ShiftReportSignatures {
  const approved = r.status === "approved";
  return {
    penyerah: r.ownerUser?.nama ?? "",
    penyerahTtdPath: r.ownerUser?.ttdUrl ?? null,
    penerima: r.receiverUser?.nama ?? "",
    penerimaTtdPath: r.receiverUser?.ttdUrl ?? null,
    supervisi: r.supervisi?.nama ?? "",
    supervisiApproved: approved,
    supervisiTtdPath: approved ? r.supervisi?.ttdUrl ?? null : null,
    pimpinanInfra: resolveLeaderName(r.pimpinanInfra),
    pimpinanDivisi: resolveLeaderName(r.pimpinanDivisi),
  };
}
```

- [ ] **Step 4: Run, verify green.** Run: `npm test -- shiftReport`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/shiftReport.ts lib/__tests__/shiftReport.test.ts
git commit -m "feat(shift-report): add pure signature/label helpers + tests"
```

---

## Task 3: Create `ShiftReport` on handover + manual close

**Files:**
- Modify: `app/api/shift/handover/route.ts`
- Create: `app/api/shift/close/route.ts`

- [ ] **Step 1: In handover route, capture the created handover id and create the report inside the transaction.** Change the `tx.shiftHandover.create` block to assign its result, then add a `tx.shiftReport.create` after ticket mutations. Imports: add `getShiftLabel` from `@/lib/shiftReport`.

```ts
await prisma.$transaction(async (tx) => {
  const handover = await tx.shiftHandover.create({
    data: {
      fromUserId: session.sub,
      toUserId: receiverUserId,
      fromShift: fromShift as ShiftKode,
      toShift,
      pimpinanInfraId,
      pimpinanDivisiId,
      supervisiId,
      supervisiNextId,
    },
  });

  await tx.ticket.updateMany({
    where: {
      status: TicketStatus.selesai,
      shiftKode: fromShift as ShiftKode,
      OR: shiftScopeOR,
    },
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
    await tx.ticket.updateMany({
      where: { status: TicketStatus.proses },
      data: { shiftKode: toShift, supervisiId },
    });
  }

  // 1 shift = 1 laporan (PART 2): dibuat saat serah terima, status pending.
  await tx.shiftReport.create({
    data: {
      tanggal: new Date(),
      shiftKode: fromShift as ShiftKode,
      shiftLabel: getShiftLabel(fromShift),
      ownerUserId: session.sub,
      receiverUserId,
      supervisiId,
      supervisiNextId,
      pimpinanInfraId,
      pimpinanDivisiId,
      handoverId: handover.id,
    },
  });
});
```

- [ ] **Step 2: Create the manual-close route** `app/api/shift/close/route.ts`. Same modal payload but `receiverUserId` optional; does NOT rotate tickets to the next shift (no receiver). Still tags supervisi on this shift's tickets, marks open tickets as tindak-lanjut, creates the report, ends the session.

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { signSession, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/jwt";
import { ALL_SHIFTS, type ShiftCode } from "@/lib/shift";
import { getShiftLabel } from "@/lib/shiftReport";

const TINDAK_LANJUT_TEKS = "TINDAK LANJUT MONITORING SELANJUTNYA";

/**
 * POST /api/shift/close — "Tutup Laporan Shift" (PART 6). Membuat ShiftReport
 * tanpa penerima saat user lupa serah terima. Tidak merotasi shiftKode tiket
 * (tidak ada penerima). Sesi shift dikosongkan setelah ditutup.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  if (session.role === "supervisi")
    return NextResponse.json({ error: "Supervisi tidak menutup laporan shift." }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { body = {}; }
  const pimpinanInfraId = typeof body.pimpinanInfraId === "string" ? body.pimpinanInfraId : "";
  const pimpinanDivisiId = typeof body.pimpinanDivisiId === "string" ? body.pimpinanDivisiId : "";
  const supervisiId = typeof body.supervisiId === "string" ? body.supervisiId : "";
  const supervisiNextId =
    typeof body.supervisiNextId === "string" && body.supervisiNextId ? body.supervisiNextId : null;
  if (!pimpinanInfraId || !pimpinanDivisiId || !supervisiId)
    return NextResponse.json(
      { error: "Pilih Pimpinan Infrastruktur, Pimpinan Divisi, dan Supervisi." },
      { status: 400 }
    );

  const fromShift = session.shift;
  if (!ALL_SHIFTS.includes(fromShift as ShiftCode))
    return NextResponse.json({ error: "Tidak ada shift aktif untuk ditutup." }, { status: 400 });

  const startedAt = session.shiftStartedAt ? new Date(session.shiftStartedAt) : null;
  const mineWhere: Record<string, unknown> = { ownerUserId: session.sub };
  if (startedAt && !Number.isNaN(startedAt.getTime())) mineWhere.waktuOpen = { gte: startedAt };
  const shiftScopeOR = [mineWhere, { activities: { some: { isTindakLanjutFlag: true } } }];

  const openTickets = await prisma.ticket.findMany({
    where: { status: TicketStatus.proses }, select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    const handover = await tx.shiftHandover.create({
      data: {
        fromUserId: session.sub,
        toUserId: null,
        fromShift: fromShift as ShiftKode,
        toShift: fromShift as ShiftKode,
        pimpinanInfraId,
        pimpinanDivisiId,
        supervisiId,
        supervisiNextId,
      },
    });
    await tx.ticket.updateMany({
      where: { shiftKode: fromShift as ShiftKode, OR: shiftScopeOR },
      data: { supervisiId },
    });
    if (openTickets.length > 0) {
      await tx.ticketActivity.createMany({
        data: openTickets.map((t) => ({
          ticketId: t.id, userId: session.sub,
          shiftKode: fromShift as ShiftKode,
          teks: TINDAK_LANJUT_TEKS, isTindakLanjutFlag: true,
        })),
      });
    }
    await tx.shiftReport.create({
      data: {
        tanggal: new Date(),
        shiftKode: fromShift as ShiftKode,
        shiftLabel: getShiftLabel(fromShift),
        ownerUserId: session.sub,
        receiverUserId: null,
        supervisiId,
        supervisiNextId,
        pimpinanInfraId,
        pimpinanDivisiId,
        handoverId: handover.id,
      },
    });
  });

  const token = await signSession({
    sub: session.sub, username: session.username, nama: session.nama,
    role: session.role, shift: "", shiftStartedAt: "",
  });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, shift: fromShift });
}
```

- [ ] **Step 3: Typecheck.** Run: `./node_modules/.bin/tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add app/api/shift/handover/route.ts app/api/shift/close/route.ts
git commit -m "feat(shift-report): create report on handover + manual close route"
```

---

## Task 4: Shift-report queries `lib/shiftReportQueries.ts`

**Files:**
- Create: `lib/shiftReportQueries.ts`

Ticket-matching rule for a report = tickets with `openShiftKode === report.shiftKode` and `waktuOpen` within the WIB day of `report.tanggal` (mirrors `buildReportTicketWhere` harian scope).

- [ ] **Step 1: Implement queries.**

```ts
import "server-only";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveLeaderName } from "@/lib/reportSignatures";

function wibDayRange(tanggal: Date): { start: Date; end: Date } {
  // WIB day that contains `tanggal`.
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(tanggal); // YYYY-MM-DD
  const start = new Date(`${key}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

async function countTickets(shiftKode: ShiftKode, tanggal: Date): Promise<number> {
  const { start, end } = wibDayRange(tanggal);
  return prisma.ticket.count({
    where: { openShiftKode: shiftKode, waktuOpen: { gte: start, lt: end } },
  });
}

export interface ShiftReportListItem {
  id: string;
  tanggal: Date;
  shiftKode: ShiftKode;
  shiftLabel: string;
  ownerNama: string;
  receiverNama: string | null;
  status: string;
  approverNama: string | null;
  jmlTiket: number;
}

export interface ShiftReportListFilter {
  supervisiId?: string | null; // scope ke supervisi; null = semua (superadmin)
  status?: string | null;       // pending | approved
  from?: Date | null;
  to?: Date | null;
}

export async function listShiftReports(f: ShiftReportListFilter): Promise<ShiftReportListItem[]> {
  const where: Record<string, unknown> = {};
  if (f.supervisiId) where.supervisiId = f.supervisiId;
  if (f.status === "pending" || f.status === "approved") where.status = f.status;
  if (f.from || f.to) {
    where.tanggal = {};
    if (f.from) (where.tanggal as Record<string, Date>).gte = f.from;
    if (f.to) (where.tanggal as Record<string, Date>).lte = f.to;
  }
  const rows = await prisma.shiftReport.findMany({
    where, orderBy: { tanggal: "desc" },
    include: {
      ownerUser: { select: { nama: true } },
      receiverUser: { select: { nama: true } },
      approver: { select: { nama: true } },
    },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id, tanggal: r.tanggal, shiftKode: r.shiftKode, shiftLabel: r.shiftLabel,
      ownerNama: r.ownerUser.nama, receiverNama: r.receiverUser?.nama ?? null,
      status: r.status, approverNama: r.approver?.nama ?? null,
      jmlTiket: await countTickets(r.shiftKode, r.tanggal),
    }))
  );
}

export interface ShiftReportDetailTicket {
  id: string; noTiket: string; kategori: string; kodeAtm: string; namaAtm: string;
  status: string; waktuOpen: Date; waktuSelesai: Date | null;
}

export interface ShiftReportDetail {
  id: string; tanggal: Date; shiftKode: ShiftKode; shiftLabel: string;
  ownerNama: string; receiverNama: string | null; supervisiId: string | null;
  supervisiNama: string | null; pimpinanInfra: string; pimpinanDivisi: string;
  status: string; approverNama: string | null; approvedAt: Date | null;
  catatanSupervisi: string | null; tickets: ShiftReportDetailTicket[];
}

export async function getShiftReportDetail(id: string): Promise<ShiftReportDetail | null> {
  const r = await prisma.shiftReport.findUnique({
    where: { id },
    include: {
      ownerUser: { select: { nama: true } },
      receiverUser: { select: { nama: true } },
      supervisi: { select: { nama: true } },
      approver: { select: { nama: true } },
      pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
      pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
    },
  });
  if (!r) return null;
  const { start, end } = wibDayRange(r.tanggal);
  const tickets = await prisma.ticket.findMany({
    where: { openShiftKode: r.shiftKode, waktuOpen: { gte: start, lt: end } },
    orderBy: { waktuOpen: "asc" },
    include: { atm: { select: { kodeAtm: true, namaAtm: true } } },
  });
  return {
    id: r.id, tanggal: r.tanggal, shiftKode: r.shiftKode, shiftLabel: r.shiftLabel,
    ownerNama: r.ownerUser.nama, receiverNama: r.receiverUser?.nama ?? null,
    supervisiId: r.supervisiId, supervisiNama: r.supervisi?.nama ?? null,
    pimpinanInfra: resolveLeaderName(r.pimpinanInfra),
    pimpinanDivisi: resolveLeaderName(r.pimpinanDivisi),
    status: r.status, approverNama: r.approver?.nama ?? null, approvedAt: r.approvedAt,
    catatanSupervisi: r.catatanSupervisi,
    tickets: tickets.map((t) => ({
      id: t.id, noTiket: t.noTiket, kategori: t.kategori,
      kodeAtm: t.atm?.kodeAtm ?? "—", namaAtm: t.atm?.namaAtm ?? "—",
      status: t.status, waktuOpen: t.waktuOpen, waktuSelesai: t.waktuSelesai,
    })),
  };
}

/** Map ticket → its shift-report supervisi status, for monitoring columns. */
export interface TicketSupervisiStatus { status: string; supervisiNama: string | null; }

export async function buildShiftReportStatusMap(
  range: { from: Date; to: Date }
): Promise<Map<string, TicketSupervisiStatus>> {
  const reports = await prisma.shiftReport.findMany({
    where: { tanggal: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: "desc" },
    include: { approver: { select: { nama: true } }, supervisi: { select: { nama: true } } },
  });
  const map = new Map<string, TicketSupervisiStatus>();
  for (const r of reports) {
    const key = `${dateKeyWIB(r.tanggal)}|${r.shiftKode}`;
    if (!map.has(key)) {
      map.set(key, {
        status: r.status,
        supervisiNama: r.approver?.nama ?? r.supervisi?.nama ?? null,
      });
    }
  }
  return map;
}

export function dateKeyWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function ticketShiftReportKey(openShiftKode: string, waktuOpen: Date): string {
  return `${dateKeyWIB(waktuOpen)}|${openShiftKode}`;
}
```

- [ ] **Step 2: Typecheck.** Run: `./node_modules/.bin/tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add lib/shiftReportQueries.ts
git commit -m "feat(shift-report): add list/detail/status-map queries"
```

---

## Task 5: Shift-report APIs (list + approve)

**Files:**
- Create: `app/api/shift-reports/route.ts`
- Create: `app/api/shift-reports/[id]/approve/route.ts`

- [ ] **Step 1: List API** (`GET /api/shift-reports?status=&from=&to=`). Supervisi scoped to self; superadmin sees all.

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listShiftReports } from "@/lib/shiftReportQueries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  if (session.role !== "supervisi" && session.role !== "superadmin")
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const fromStr = sp.get("from");
  const toStr = sp.get("to");
  const from = fromStr ? new Date(`${fromStr}T00:00:00+07:00`) : null;
  const to = toStr ? new Date(`${toStr}T23:59:59+07:00`) : null;

  const items = await listShiftReports({
    supervisiId: session.role === "supervisi" ? session.sub : null,
    status, from, to,
  });
  return NextResponse.json({ items });
}
```

- [ ] **Step 2: Approve API** (`POST /api/shift-reports/[id]/approve`, body `{ catatan?: string }`).

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  if (session.role !== "supervisi")
    return NextResponse.json({ error: "Hanya Supervisi yang dapat menyetujui laporan shift." }, { status: 403 });

  const { id } = await params;
  let catatan: string | null = null;
  try {
    const body = (await req.json()) ?? {};
    if (typeof body.catatan === "string" && body.catatan.trim()) catatan = body.catatan.trim();
  } catch { /* no body */ }

  const report = await prisma.shiftReport.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "Laporan shift tidak ditemukan." }, { status: 404 });
  if (report.supervisiId !== session.sub)
    return NextResponse.json({ error: "Laporan ini bukan tanggung jawab supervisi Anda." }, { status: 403 });
  if (report.status === "approved")
    return NextResponse.json({ error: "Laporan shift sudah disetujui." }, { status: 409 });

  await prisma.shiftReport.update({
    where: { id },
    data: { status: "approved", approvedAt: new Date(), approvedById: session.sub, catatanSupervisi: catatan },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + commit.**

Run: `./node_modules/.bin/tsc --noEmit` (clean), then:

```bash
git add app/api/shift-reports
git commit -m "feat(shift-report): list + approve API routes"
```

---

## Task 6: Supervisi menu — list + detail UI

**Files:**
- Create: `components/supervisi/ShiftReportListClient.tsx`
- Create: `components/supervisi/ShiftReportDetailClient.tsx`
- Modify: `app/(app)/supervisi/page.tsx`
- Replace: `app/(app)/supervisi/[id]/page.tsx`

- [ ] **Step 1: List client.** Table columns: Tanggal | Shift | Petugas (Owner) | Penerima | Jml Tiket | Status | Aksi. Filters: status (Menunggu/Sudah) + date range. Status badge: warning "Menunggu Approval" / success "Sudah Diapprove". Aksi → `router.push(/supervisi/${id})`. Fetches `/api/shift-reports`. Model after `SupervisiClient.tsx` structure (debounced `useEffect`, `SHIFT_NAMES` for shift label, `fmtDateTime`/`fmtDateKey`). Props: `{ initialItems: ShiftReportListItem[] }`.

- [ ] **Step 2: Detail client.** Props: `{ report: ShiftReportDetail; canApprove: boolean }`. Renders read-only Info Shift (tanggal, shift, owner, penerima, pimpinan infra, pimpinan divisi), ticket table (No Tiket | Kategori | Lokasi ATM | Status | Lama Penanganan via `computeSla` | SLA) with row click → expand kronologi (fetch `/api/tickets/[id]` or reuse existing detail fetch — use an accordion that lazy-loads `getTicketDetail` via a small `/api/tickets/[id]` GET; that route already exists). If `tickets.length === 0` show "Tidak ada gangguan pada shift ini." Bottom: `<textarea>` Catatan Supervisi (optional) + green Button "Approve Laporan Shift" (hidden/disabled if `status==='approved'` or `!canApprove`) → `POST /api/shift-reports/${id}/approve` then `router.refresh()`.

- [ ] **Step 3: Replace `app/(app)/supervisi/page.tsx`** to list shift reports:

```tsx
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listShiftReports } from "@/lib/shiftReportQueries";
import { ShiftReportListClient } from "@/components/supervisi/ShiftReportListClient";

export const dynamic = "force-dynamic";

export default async function SupervisiPage() {
  const session = await requireSession();
  if (session.role !== "supervisi" && session.role !== "superadmin") redirect("/dashboard");
  const items = await listShiftReports({
    supervisiId: session.role === "supervisi" ? session.sub : null,
  });
  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Supervisi</h1>
        <p className="page-subtitle">
          Tinjau laporan shift yang menunggu persetujuan. Setujui satu laporan
          shift sekaligus — tanda tangan digital Anda otomatis terpasang di
          laporan Excel shift tersebut.
        </p>
      </div>
      <ShiftReportListClient initialItems={items} />
    </div>
  );
}
```

- [ ] **Step 4: Replace `app/(app)/supervisi/[id]/page.tsx`** to render shift-report detail:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getShiftReportDetail } from "@/lib/shiftReportQueries";
import { ShiftReportDetailClient } from "@/components/supervisi/ShiftReportDetailClient";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export default async function SupervisiShiftReportPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();
  if (session.role !== "supervisi" && session.role !== "superadmin") redirect("/dashboard");
  const report = await getShiftReportDetail(id);
  if (!report) notFound();
  if (session.role === "supervisi" && report.supervisiId !== session.sub) redirect("/supervisi");
  return (
    <ShiftReportDetailClient
      report={report}
      canApprove={session.role === "supervisi" && report.supervisiId === session.sub}
    />
  );
}
```

- [ ] **Step 5: Typecheck + lint.** Run `./node_modules/.bin/tsc --noEmit` and `npm run lint`. Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add app/\(app\)/supervisi components/supervisi
git commit -m "feat(shift-report): supervisi menu lists & approves shift reports"
```

---

## Task 7: Excel signatures from `ShiftReport`

**Files:**
- Modify: `lib/reportData.ts`

- [ ] **Step 1: Look up the ShiftReport** for `(shift, day, owner?)` and prefer it for signatures; fall back to existing handover-based logic when none exists (backward compat for pre-migration dates). Add import of `resolveShiftReportSignatures` from `@/lib/shiftReport`. After the existing `handover` lookup, add:

```ts
const shiftReport = shift
  ? await prisma.shiftReport.findFirst({
      where: {
        shiftKode: shift,
        tanggal: { gte: startWib, lt: endWib },
        ...(p.ownerUserId ? { ownerUserId: p.ownerUserId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        ownerUser: { select: { nama: true, ttdUrl: true } },
        receiverUser: { select: { nama: true, ttdUrl: true } },
        supervisi: { select: { nama: true, ttdUrl: true } },
        pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
        pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
      },
    })
  : null;
```

- [ ] **Step 2: Build `signatures` from the report when present, else keep current logic.** Replace the `const signatures: ReportSignatures = {...}` block with:

```ts
let signatures: ReportSignatures;
if (shiftReport) {
  const s = resolveShiftReportSignatures(shiftReport);
  signatures = {
    penyerah: s.penyerah || resolveSender(ticketRows[0]?.owner, handover?.fromUser, uniqueJoin(ticketRows.map((t) => t.owner.nama))).nama,
    penyerahTtdPath: s.penyerahTtdPath,
    penerima: s.penerima,
    penerimaTtdPath: s.penerimaTtdPath,
    supervisi: s.supervisi,
    supervisiApproved: s.supervisiApproved,
    supervisiTtdPath: s.supervisiTtdPath,
    pimpinanInfra: s.pimpinanInfra,
    pimpinanDivisi: s.pimpinanDivisi,
  };
} else {
  // … existing handover/ticket fallback (unchanged) …
}
```

Keep the existing fallback block verbatim inside the `else`. Remove the now-unused `approver`/`supervisiApproved` const only if it becomes unreferenced in the fallback (it is still used by the fallback — leave it).

- [ ] **Step 3: `namaPetugas` for filename** — keep `signatures.penyerah || "-"` (already correct).

- [ ] **Step 4: Typecheck + commit.**

Run: `./node_modules/.bin/tsc --noEmit` (clean), then:

```bash
git add lib/reportData.ts
git commit -m "feat(shift-report): Excel signatures sourced from ShiftReport"
```

---

## Task 8: Monitoring "Status Supervisi" columns from `ShiftReport`

**Files:**
- Modify: `lib/ticketQueries.ts`
- Modify: `components/daily-monitoring/DailyMonitoringClient.tsx`
- Modify: `components/weekly-monitoring/WeeklyMonitoringClient.tsx`

- [ ] **Step 1: Add a derived field `supervisiStatus`** (`"pending" | "approved"`) + `supervisiNama` to `TicketListItem` and `WeeklyTicketItem`. After mapping tickets in `listTickets` and `listWeeklyTickets`, compute the date range covered by the result set and call `buildShiftReportStatusMap`, then for each ticket look up `ticketShiftReportKey(t.openShiftKode, t.waktuOpen)`. NOTE: `listTickets` currently does not select `openShiftKode`; add it to the query `select`/default (it is returned by default in findMany without `select` — this query uses `include`, so all scalar fields are present). Map default = `{ status: "pending", supervisiNama: null }` when no report.

Add to both item interfaces:
```ts
  supervisiStatus: string;     // pending | approved (dari ShiftReport)
  supervisiNama: string | null;
```
And in the map step (example for weekly):
```ts
const range = { from: f.from, to: f.to };
const statusMap = await buildShiftReportStatusMap(range);
return tickets.map((t) => {
  const sr = statusMap.get(ticketShiftReportKey(t.openShiftKode, t.waktuOpen));
  return { ...existing fields..., supervisiStatus: sr?.status ?? "pending", supervisiNama: sr?.supervisiNama ?? null };
});
```
For `listTickets` (Daily) there is no explicit range; derive from min/max `waktuOpen` of results, or just query reports for `tanggal` within the day(s) present. Simplest: compute `from = min(waktuOpen)`, `to = now`. Import `buildShiftReportStatusMap`, `ticketShiftReportKey` from `@/lib/shiftReportQueries`.

- [ ] **Step 2: Daily client** — change the "Supervisi" column badge to use `t.supervisiStatus`: `approved` → success "Diapprove oleh {t.supervisiNama ?? 'Supervisi'}"; else neutral "Menunggu Approval".

- [ ] **Step 3: Weekly client** — same: replace `t.statusSupervisi`-based badge with `t.supervisiStatus`; approved label "Diapprove oleh {nama}", else "Menunggu Approval". (Weekly filter dropdown `statusSupervisi` may stay but now maps to shift-report status — out of scope to rewire the server filter; leave the dropdown filtering the old column OR hide it. Decision: hide the `statusSupervisi` filter `<select>` in weekly to avoid confusion.)

- [ ] **Step 4: Typecheck + lint + commit.**

Run `./node_modules/.bin/tsc --noEmit` and `npm run lint` (clean), then:

```bash
git add lib/ticketQueries.ts components/daily-monitoring/DailyMonitoringClient.tsx components/weekly-monitoring/WeeklyMonitoringClient.tsx
git commit -m "feat(shift-report): monitoring supervisi status from ShiftReport"
```

---

## Task 9: Remove per-ticket approve UI + add "Tutup Laporan Shift"

**Files:**
- Modify: `components/daily-monitoring/TicketDetailClient.tsx`
- Modify: `components/daily-monitoring/DailyMonitoringClient.tsx`

- [ ] **Step 1: Remove the per-ticket "Approve" button** from `TicketDetailClient.tsx` (the supervisi-only approve action calling `/api/tickets/[id]/approve`). Remove the handler + button + any now-unused state. Leave the rest of the detail (read-only kronologi) intact. (Leave `/api/tickets/[id]/approve/route.ts` on disk but unused — safe per decision.)

- [ ] **Step 2: Add "Tutup Laporan Shift" button** in `DailyMonitoringClient.tsx` next to "Serah Terima Shift", shown whenever `hasShift`. Reuse the same modal pickers (Pimpinan Infra/Divisi/Supervisi/Supervisi-next) but WITHOUT the receiver field. Add modal state `closeOpen`, reuse `hoInfra/hoDivisi/hoSupervisi/hoSupervisiNext`. On submit `POST /api/shift/close` with those ids; on success close modal, `loadTickets()`, `router.refresh()`. Add a `closeBusy`/`closeErr` pair mirroring `hoBusy`/`hoErr`. The button styling: `variant="secondary"`, label "Tutup Laporan Shift" with a relevant icon (e.g. `FileCheck`).

- [ ] **Step 3: Typecheck + lint + commit.**

Run `./node_modules/.bin/tsc --noEmit` and `npm run lint` (clean), then:

```bash
git add components/daily-monitoring
git commit -m "feat(shift-report): remove per-ticket approve, add Tutup Laporan Shift"
```

---

## Task 10: Dashboard Supervisi — shift-report metric + calendar

**Files:**
- Modify: `lib/dashboardQueries.ts`
- Modify: `app/api/dashboard/supervisi/route.ts`
- Modify: `components/dashboard/SupervisiDashboardClient.tsx`
- Modify: `components/dashboard/SupervisiMetricCards.tsx`
- Modify: `components/dashboard/SupervisiDayTicketList.tsx`

- [ ] **Step 1: Rewrite `getSupervisiDashboardData`** to count pending `ShiftReport`s for this supervisi and return them for the calendar. New shape:

```ts
export interface SupervisiPendingShiftReport {
  id: string; tanggal: Date; shiftKode: ShiftKode; shiftLabel: string;
  ownerNama: string; jmlTiket: number;
}
export interface SupervisiDashboardData {
  pendingCount: number;
  pendingReports: SupervisiPendingShiftReport[];
  generatedAt: string;
}
export async function getSupervisiDashboardData(supervisiId: string): Promise<SupervisiDashboardData> {
  const rows = await prisma.shiftReport.findMany({
    where: { supervisiId, status: "pending" },
    orderBy: { tanggal: "desc" },
    include: { ownerUser: { select: { nama: true } } },
  });
  // jmlTiket per report — reuse the wibDayRange/count approach (import from shiftReportQueries or inline).
  const pendingReports = await Promise.all(rows.map(async (r) => ({
    id: r.id, tanggal: r.tanggal, shiftKode: r.shiftKode, shiftLabel: r.shiftLabel,
    ownerNama: r.ownerUser.nama, jmlTiket: await countTicketsForShiftDay(r.shiftKode, r.tanggal),
  })));
  return { pendingCount: rows.length, pendingReports, generatedAt: new Date().toISOString() };
}
```
Export a small `countTicketsForShiftDay` (or import the day-range helper). Keep `SupervisiPendingTicket` type removed/replaced; update all references.

- [ ] **Step 2: API route** — unchanged logic; it just returns the new shape. Verify no field references break.

- [ ] **Step 3: Metric card** — change `SupervisiMetricCards` to a single card "Laporan Shift Belum Diapprove" using `pendingCount`. Simplify props to `{ pendingCount: number }`.

- [ ] **Step 4: Dashboard client** — `markedDates` from `pendingReports.map(r => fmtDateKey(r.tanggal))`; day list filters `pendingReports` by `fmtDateKey(r.tanggal) === selected`. Update `SupervisiDayTicketList` to render shift reports (Shift label, owner, jml tiket, link to `/supervisi/${id}`). Rename appropriately or keep filename.

- [ ] **Step 5: Typecheck + lint + commit.**

Run `./node_modules/.bin/tsc --noEmit` and `npm run lint` (clean), then:

```bash
git add lib/dashboardQueries.ts app/api/dashboard/supervisi/route.ts components/dashboard
git commit -m "feat(shift-report): supervisi dashboard metric + calendar on shift reports"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full test suite.** Run: `npm test`. Expected: all pass.
- [ ] **Step 2: Typecheck.** Run: `./node_modules/.bin/tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Lint.** Run: `npm run lint`. Expected: clean.
- [ ] **Step 4: Build smoke (optional).** Run: `./node_modules/.bin/next build` if time permits.
- [ ] **Step 5: Manual checklist (spec §Verifikasi):** handover → 1 pending report; shift w/o tickets → report still made & approvable; Supervisi menu lists reports w/ pending|approved filter; detail shows tickets or "Tidak ada gangguan pada shift ini" + approve; after approve → supervisi TTD appears in Excel; empty shift Excel has header+suhu/log+signature block, empty body; Daily/Weekly supervisi column reads ShiftReport; dashboard card = "Laporan Shift Belum Diapprove".

---

## Self-Review notes
- **Spec coverage:** PART 1 → T1; PART 2 → T3; PART 3 → T4,T5,T6; PART 4 → T7; PART 5 → T7(signatures)+T8(monitoring)+T9(approve button)+T10(dashboard); PART 6 → T3(close route)+T9(button), empty-shift handled by existing `excelReport.ts` empty-body branch + report-always-created.
- **Backward compat:** old dates without a `ShiftReport` keep the existing handover/ticket signature fallback (T7 `else`).
- **Ticket↔report matching:** consistent `openShiftKode` + WIB-day everywhere (queries, count, status map, Excel).
- **Kept-unused:** `tickets.statusSupervisi/approvedById/approvedAt`, `StatusSupervisi` enum, `/api/tickets/[id]/approve` route all remain on disk, no longer read by report/monitoring/dashboard.
</content>
</invoke>
