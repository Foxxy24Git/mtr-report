# SLA Internal vs SLA Eksternal + Restitusi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu Monitoring SLA mendapat toggle "SLA Internal | SLA Eksternal" — Internal dihitung dari `waktuOpen` (formula lama, tidak berubah), Eksternal dihitung dari saat "No Tiket Vendor" pertama kali diisi sampai tiket selesai — plus kolom Restitusi (tabel denda per tier availability, Lampiran IV PKS ARTAJASA–Bank Nagari No. PKS/042/DIR/11-2024) yang hanya terisi pada basis Eksternal.

**Architecture:** Kolom baru `Ticket.waktuLaporVendor` (nullable, immutable setelah terisi — pola sama seperti `waktuResponInternal` yang sudah ada) dicatat otomatis di dua titik mutasi tiket (create & update). `lib/slaMonitoring.ts` menambah parameter `basis: "internal" | "eksternal"` ke `getLowestSla` & `getSlaSummary`; downtime per tiket dihitung dari `waktuOpen` (internal) atau `waktuLaporVendor` (eksternal, dengan tiket yang belum punya `waktuLaporVendor` dikecualikan sebagai N/A, bukan dihitung 100%). Restitusi adalah fungsi murni tabel-lookup dari SLA% yang hanya dilampirkan ke baris tabel "SLA Terendah" saat basis eksternal. Tabel "Paling Sering Bermasalah", kedua donut chart, dan Excel "Laporan Permasalahan" tidak disentuh sama sekali — murni scope basis SLA + restitusi.

**Tech Stack:** Next.js 15 (App Router) · Prisma 6 + PostgreSQL · Vitest · TypeScript · Tailwind v3

## Global Constraints

- **Pakai binary lokal, BUKAN `npx`** (hook RTK dapat merusak `npx`): `./node_modules/.bin/prisma`, `./node_modules/.bin/tsc`, `./node_modules/.bin/vitest`.
- **Kolom baru nullable, TANPA backfill.** Tiket lama otomatis `waktuLaporVendor = NULL` → otomatis N/A di SLA Eksternal. Ini WAJAR, bukan bug.
- **`waktuLaporVendor` IMMUTABLE setelah terisi** — sekali tercatat (create ATAU update pertama kali No Tiket Vendor diisi), edit/koreksi No Tiket Vendor berikutnya TIDAK PERNAH menimpanya. Pola identik `waktuResponInternal` di `app/api/tickets/[id]/activities/route.ts:74-78`.
- **TIDAK ADA field input tambahan di form** — `waktuLaporVendor` murni dicatat otomatis di server.
- **Tabel "Paling Sering Bermasalah" (`getMostTrouble`), kedua donut chart (`getByJenisGangguan`/`getBySumberPenyebab`), dan Excel `lib/problemReportExcel.ts` TIDAK berubah** — basis SLA hanya memengaruhi Kartu Ringkasan SLA + tabel "SLA Terendah" (endpoint `/api/sla/summary` & `/api/sla/lowest`).
- **Konsekuensi yang disengaja:** karena `getSlaSummary` memfilter baris kerja (`rowsUsed`) sebelum loop, saat basis = Eksternal maka **seluruh** kartu ringkasan (Total Tiket, Total Downtime, ATM/Jaringan Bermasalah) ikut hanya menghitung tiket yang punya `waktuLaporVendor` — bukan cuma kartu "Rata-rata SLA". Ini mengikuti pseudocode yang sudah dikonfirmasi user secara eksplisit; jangan "diperbaiki" jadi partial-basis tanpa konfirmasi ulang.
- **Restitusi HANYA muncul saat basis Eksternal.** Saat Internal, field `restitusi` pada `LowestSlaRow` tidak ada (bukan `null`), dan kolom tabel disembunyikan total di UI (bukan ditampilkan "-").
- **Tier restitusi 70%:** pakai `p > 70.0` (bukan `>=`) untuk tier 60%, supaya tepat 70,0% jatuh ke "Bebas Biaya Bulanan" — keputusan eksplisit user karena tabel sumber tumpang tindih di titik itu.
- **Fitur drill-down klik-ke-tiket** (kalau ada rencana terpisah) di luar scope plan ini — independen, bisa dikerjakan urutan manapun.
- Komentar kode & UI berbahasa Indonesia, mengikuti konvensi repo.
- Jalankan `./node_modules/.bin/vitest run` dan `./node_modules/.bin/tsc --noEmit` sebelum tiap commit; laporkan hasilnya.

---

### Task 1: Skema Prisma — kolom `waktuLaporVendor`

**Files:**
- Modify: `prisma/schema.prisma:178` (model `Ticket`, setelah `waktuResponInternal`)
- Create: `prisma/migrations/<timestamp>_add_waktu_lapor_vendor/migration.sql` (dihasilkan Prisma)

**Interfaces:**
- Consumes: —
- Produces: field `Ticket.waktuLaporVendor: Date | null`. Dipakai Task 2, 3, 4, 5.

- [ ] **Step 1: Tambah kolom di `model Ticket`**

Di `prisma/schema.prisma`, sisipkan baris baru persis setelah baris 178 (`waktuResponInternal DateTime? @map("waktu_respon_internal")`), sebelum `cpTipe`:

```prisma
  waktuResponInternal DateTime?       @map("waktu_respon_internal")
  waktuLaporVendor    DateTime?       @map("waktu_lapor_vendor")
  cpTipe              CpTipe?         @map("cp_tipe")
```

(Perhatikan alignment kolom mengikuti pola yang sudah ada — nama field rata kiri lebar 20 karakter, tipe rata kiri lebar 16 karakter.)

- [ ] **Step 2: Jalankan migrasi**

```bash
./node_modules/.bin/prisma migrate dev --name add_waktu_lapor_vendor
```

Expected: migrasi baru terbuat, `prisma generate` jalan otomatis, TIDAK ada prompt data-loss (kolom nullable, tanpa default).

- [ ] **Step 3: Verifikasi tipe Prisma Client ter-generate**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task1.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc-task1.log
```

Expected: `exit=0` (kolom baru belum dipakai kode mana pun).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): tambah kolom waktu_lapor_vendor untuk basis SLA Eksternal"
```

---

### Task 2: Auto-catat `waktuLaporVendor` saat Open Tiket (POST)

**Files:**
- Modify: `app/api/tickets/route.ts:164-187`
- Test: `app/api/tickets/__tests__/createTicketWaktuLaporVendor.test.ts`

**Interfaces:**
- Consumes: `Ticket.waktuLaporVendor` (Task 1)
- Produces: perilaku create — `waktuLaporVendor` terisi `now()` hanya bila `noTiketVendor` diisi saat open. Tidak ada export baru.

- [ ] **Step 1: Tulis test yang gagal**

Buat `app/api/tickets/__tests__/createTicketWaktuLaporVendor.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/createTicketWaktuLaporVendor.test.ts
```

Expected: FAIL — `createData!.waktuLaporVendor` seharusnya `Date` tapi `undefined` (field belum diisi di route).

- [ ] **Step 3: Implementasikan di `app/api/tickets/route.ts`**

Baris 164-187 saat ini:

```ts
  const noTiket = await generateUniqueNoTiket(prisma);
  const shiftKode = session.shift as ShiftKode;

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        noTiket,
        kategori: kategori as TicketKategori,
        atmId: atm.id,
        cpTipe: cpTipe as CpTipe,
        cpNama,
        cpTelp,
        jenisGangguan,
        sumberPenyebab,
        metodePenanganan,
        vendor: optStr(body?.vendor),
        noTiketVendor: optStr(body?.noTiketVendor),
        shiftKode,
        // Shift asal = shift saat open; immutable, dipakai untuk laporan.
        openShiftKode: shiftKode,
        ownerUserId: session.sub,
        ...(waktuOpen ? { waktuOpen } : {}),
      },
    });
```

Ganti menjadi:

```ts
  const noTiket = await generateUniqueNoTiket(prisma);
  const shiftKode = session.shift as ShiftKode;
  const noTiketVendor = optStr(body?.noTiketVendor);

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        noTiket,
        kategori: kategori as TicketKategori,
        atmId: atm.id,
        cpTipe: cpTipe as CpTipe,
        cpNama,
        cpTelp,
        jenisGangguan,
        sumberPenyebab,
        metodePenanganan,
        vendor: optStr(body?.vendor),
        noTiketVendor,
        shiftKode,
        // Shift asal = shift saat open; immutable, dipakai untuk laporan.
        openShiftKode: shiftKode,
        ownerUserId: session.sub,
        ...(waktuOpen ? { waktuOpen } : {}),
        // Dasar SLA Eksternal (Lampiran IV PKS Artajasa) — dicatat sekali
        // saat No Tiket Vendor pertama kali ada, immutable sesudahnya.
        ...(noTiketVendor ? { waktuLaporVendor: new Date() } : {}),
      },
    });
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/createTicketWaktuLaporVendor.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add app/api/tickets/route.ts app/api/tickets/__tests__/createTicketWaktuLaporVendor.test.ts
git commit -m "feat(sla): auto-catat waktuLaporVendor saat Open Tiket"
```

---

### Task 3: Auto-catat `waktuLaporVendor` saat edit tiket (PATCH), immutable

**Files:**
- Modify: `app/api/tickets/[id]/route.ts:80-101`
- Test: `app/api/tickets/__tests__/patchWaktuLaporVendor.test.ts`

**Interfaces:**
- Consumes: `Ticket.waktuLaporVendor` (Task 1); `guard.ticket` dari `guardTicketMutation` (sudah mengembalikan row `Ticket` lengkap tanpa `select`, lihat `lib/ticketGuard.ts:23` — otomatis punya `waktuLaporVendor` & `noTiketVendor` setelah Task 1).
- Produces: perilaku update — `waktuLaporVendor` terisi `now()` hanya sekali, saat pertama kali `noTiketVendor` diisi lewat edit. Tidak ada export baru.

- [ ] **Step 1: Tulis test yang gagal**

Buat `app/api/tickets/__tests__/patchWaktuLaporVendor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * waktuLaporVendor OTOMATIS tercatat sekali saat No Tiket Vendor pertama
 * kali diisi lewat edit (PATCH), lalu IMMUTABLE walau nomor vendor
 * dikoreksi lagi — dasar SLA Eksternal (Lampiran IV PKS Artajasa).
 */

let updateData: Record<string, unknown> | null = null;
let guardTicket: {
  id: string;
  status: "proses" | "selesai";
  waktuSelesai: Date | null;
  noTiketVendor: string | null;
  waktuLaporVendor: Date | null;
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        updateData = args.data;
        return { id: "t-1", ...args.data };
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
  guardTicketMutation: async () => ({ ok: true, ticket: guardTicket }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/ticketQueries", () => ({ getTicketDetail: async () => null }));

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tickets/t-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "t-1" }) };

beforeEach(() => {
  updateData = null;
  guardTicket = {
    id: "t-1",
    status: "proses",
    waktuSelesai: null,
    noTiketVendor: null,
    waktuLaporVendor: null,
  };
});

describe("PATCH /api/tickets/[id] — auto-catat waktuLaporVendor", () => {
  it("noTiketVendor pertama kali diisi → waktuLaporVendor tercatat now()", async () => {
    const { PATCH } = await import("../[id]/route");
    const before = Date.now();
    const res = await PATCH(req({ noTiketVendor: "VDR-001" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.noTiketVendor).toBe("VDR-001");
    const waktu = updateData!.waktuLaporVendor as Date;
    expect(waktu).toBeInstanceOf(Date);
    expect(waktu.getTime()).toBeGreaterThanOrEqual(before);
    expect(waktu.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("noTiketVendor sudah pernah terisi → edit ulang TIDAK menimpa waktuLaporVendor", async () => {
    guardTicket.noTiketVendor = "VDR-000";
    guardTicket.waktuLaporVendor = new Date("2026-08-01T00:00:00Z");
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(req({ noTiketVendor: "VDR-001-KOREKSI" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.noTiketVendor).toBe("VDR-001-KOREKSI");
    expect(updateData!.waktuLaporVendor).toBeUndefined();
  });

  it("noTiketVendor tidak dikirim/kosong → waktuLaporVendor tidak tercatat", async () => {
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(req({ keterangan: "update lain" }), params);
    expect(res.status).toBe(200);
    expect(updateData!.waktuLaporVendor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/patchWaktuLaporVendor.test.ts
```

Expected: FAIL pada test pertama — `updateData!.waktuLaporVendor` seharusnya `Date` tapi `undefined`.

- [ ] **Step 3: Implementasikan di `app/api/tickets/[id]/route.ts`**

Baris 80-87 saat ini:

```ts
  const data: Prisma.TicketUncheckedUpdateInput = {
    jenisGangguan: optStr(body?.jenisGangguan),
    sumberPenyebab: optStr(body?.sumberPenyebab),
    metodePenanganan: optStr(body?.metodePenanganan),
    vendor: optStr(body?.vendor),
    noTiketVendor: optStr(body?.noTiketVendor),
    keterangan: optStr(body?.keterangan),
  };
```

Ganti menjadi:

```ts
  const noTiketVendorBaru = optStr(body?.noTiketVendor);
  const data: Prisma.TicketUncheckedUpdateInput = {
    jenisGangguan: optStr(body?.jenisGangguan),
    sumberPenyebab: optStr(body?.sumberPenyebab),
    metodePenanganan: optStr(body?.metodePenanganan),
    vendor: optStr(body?.vendor),
    noTiketVendor: noTiketVendorBaru,
    keterangan: optStr(body?.keterangan),
  };

  // Dasar SLA Eksternal (Lampiran IV PKS Artajasa) — dicatat sekali saja
  // saat No Tiket Vendor pertama kali diisi, immutable sesudahnya. Pola
  // sama seperti waktuResponInternal di
  // app/api/tickets/[id]/activities/route.ts:74-78.
  const perluCatatWaktu =
    !guard.ticket.waktuLaporVendor &&
    !guard.ticket.noTiketVendor &&
    noTiketVendorBaru !== null;
  if (perluCatatWaktu) {
    data.waktuLaporVendor = new Date();
  }
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/patchWaktuLaporVendor.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add "app/api/tickets/[id]/route.ts" app/api/tickets/__tests__/patchWaktuLaporVendor.test.ts
git commit -m "feat(sla): auto-catat waktuLaporVendor saat edit No Tiket Vendor, immutable"
```

---

### Task 4: `lib/slaMonitoring.ts` — basis SLA, `downtimeMenit`, Restitusi, `getLowestSla`

**Files:**
- Modify: `lib/slaMonitoring.ts` (sekitar baris 29, 135-256)
- Test: `lib/__tests__/slaMonitoring.test.ts`

**Interfaces:**
- Consumes: `Ticket.waktuLaporVendor`, `Ticket.noTiketVendor` (Task 1)
- Produces (dipakai Task 5, 6, 7):
  - `export type SlaBasis = "internal" | "eksternal";`
  - `export interface RestitusiTier { restitusiPersen: number | null; label: string }`
  - `export function hitungRestitusi(slaPersenFrac: number): RestitusiTier`
  - `getLowestSla(filter: SlaFilter, basis?: SlaBasis): Promise<LowestSlaResponse>` (basis default `"internal"`)
  - `LowestSlaRow.restitusi?: RestitusiTier` (hanya ada saat basis eksternal)

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/__tests__/slaMonitoring.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { hitungRestitusi } from "../slaMonitoring";

describe("hitungRestitusi", () => {
  it("SLA >= 99.5% → bebas restitusi (0%)", () => {
    expect(hitungRestitusi(1.0)).toEqual({ restitusiPersen: 0, label: "0%" });
    expect(hitungRestitusi(0.995)).toEqual({ restitusiPersen: 0, label: "0%" });
  });
  it("99.0% <= SLA < 99.5% → 2%", () => {
    expect(hitungRestitusi(0.99)).toEqual({ restitusiPersen: 2, label: "2%" });
    expect(hitungRestitusi(0.9949)).toEqual({ restitusiPersen: 2, label: "2%" });
  });
  it("90.0% <= SLA < 91.0% → 40%", () => {
    expect(hitungRestitusi(0.9)).toEqual({ restitusiPersen: 40, label: "40%" });
  });
  it("tepat 70,0% → Bebas Biaya Bulanan (BUKAN tier 60%)", () => {
    expect(hitungRestitusi(0.7)).toEqual({
      restitusiPersen: null,
      label: "Bebas Biaya Bulanan",
    });
  });
  it("70,0% < SLA < 90,0% → 60%", () => {
    expect(hitungRestitusi(0.7001)).toEqual({ restitusiPersen: 60, label: "60%" });
    expect(hitungRestitusi(0.8999)).toEqual({ restitusiPersen: 60, label: "60%" });
  });
  it("SLA < 70,0% → Bebas Biaya Bulanan", () => {
    expect(hitungRestitusi(0)).toEqual({
      restitusiPersen: null,
      label: "Bebas Biaya Bulanan",
    });
  });
});

const ATM1 = {
  id: "atm-a1",
  kodeAtm: "A1",
  namaAtm: "ATM A1",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};
const ATM2 = {
  id: "atm-a2",
  kodeAtm: "A2",
  namaAtm: "ATM A2",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};

// Rentang filter 2026-08-01 s.d. 2026-08-01 → totalMenitPeriode = 1440.
const FIXTURE_ROWS = [
  {
    id: "t-a1",
    atmId: "atm-a1",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T02:00:00+07:00"), // 60 menit dari open
    noTiketVendor: null,
    waktuLaporVendor: null, // TIDAK PERNAH lapor vendor → N/A di basis eksternal
    atm: ATM1,
  },
  {
    id: "t-a2",
    atmId: "atm-a2",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-08-01T01:00:00+07:00"),
    waktuSelesai: new Date("2026-08-01T03:00:00+07:00"), // 120 menit dari open
    noTiketVendor: "VDR-1",
    waktuLaporVendor: new Date("2026-08-01T01:30:00+07:00"), // 90 menit dari lapor vendor
    atm: ATM2,
  },
];

vi.mock("../prisma", () => ({
  prisma: { ticket: { findMany: async () => FIXTURE_ROWS } },
}));

describe("getLowestSla — basis internal (default, formula lama tidak berubah)", () => {
  it("downtime dihitung dari waktuOpen, semua ATM masuk", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    expect(res.items).toHaveLength(2);
    // Urut SLA terendah dulu → A2 (downtime 120) lebih rendah dari A1 (downtime 60).
    expect(res.items[0].kodeAtm).toBe("A2");
    expect(res.items[0].totalDowntimeMenit).toBe(120);
    expect(res.items[1].kodeAtm).toBe("A1");
    expect(res.items[1].totalDowntimeMenit).toBe(60);
    expect(res.items[0].restitusi).toBeUndefined();
  });
});

describe("getLowestSla — basis eksternal", () => {
  it("ATM tanpa waktuLaporVendor dikecualikan (N/A), downtime dari waktuLaporVendor, ada restitusi", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const res = await getLowestSla(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].kodeAtm).toBe("A2");
    expect(res.items[0].totalDowntimeMenit).toBe(90); // 03:00 - 01:30, BUKAN dari waktuOpen
    expect(res.items[0].slaPersenLabel).toBe("93.75%");
    expect(res.items[0].restitusi).toEqual({ restitusiPersen: 25, label: "25%" });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run lib/__tests__/slaMonitoring.test.ts
```

Expected: FAIL — `hitungRestitusi` belum ada (import error), dan `getLowestSla` belum menerima parameter `basis`.

- [ ] **Step 3: Extend `ticketSelect` + tambah `SlaBasis`**

Di `lib/slaMonitoring.ts`, tambahkan setelah `export type SlaKategori = "atm" | "jaringan" | "semua";` (baris 29):

```ts
export type SlaKategori = "atm" | "jaringan" | "semua";
export type SlaBasis = "internal" | "eksternal";
```

Ubah `ticketSelect` (baris 135-152) — tambahkan 2 field:

```ts
const ticketSelect = {
  id: true,
  atmId: true,
  kategori: true,
  status: true,
  waktuOpen: true,
  waktuSelesai: true,
  noTiketVendor: true,
  waktuLaporVendor: true,
  atm: {
    select: {
      kodeAtm: true,
      namaAtm: true,
      cabang: true,
      alamat: true,
      vendorAtm: true,
      vendorJaringan: true,
    },
  },
} satisfies Prisma.TicketSelect;
```

- [ ] **Step 4: Refactor `downtimeMenit` untuk menerima basis**

Ganti (baris 175-179):

```ts
/** Downtime (menit) satu tiket — 0 bila belum selesai (PRD §7). */
function downtimeMenit(t: TicketRow): number {
  if (t.status !== "selesai") return 0;
  return computeSla(t.waktuOpen, t.waktuSelesai).lamaMenit ?? 0;
}
```

Menjadi:

```ts
/**
 * Downtime (menit) satu tiket, tergantung basis SLA:
 * - internal: dari waktuOpen (formula lama, PRD §7).
 * - eksternal: dari waktuLaporVendor (Lampiran IV PKS Artajasa). `null` =
 *   N/A (tiket belum pernah lapor vendor) → dikecualikan dari grouping,
 *   BUKAN dihitung sebagai downtime 0/100%.
 */
function downtimeMenit(t: TicketRow, basis: SlaBasis): number | null {
  if (basis === "eksternal" && !t.waktuLaporVendor) return null;
  if (t.status !== "selesai") return 0;
  const mulai = basis === "eksternal" ? t.waktuLaporVendor! : t.waktuOpen;
  return computeSla(mulai, t.waktuSelesai).lamaMenit ?? 0;
}
```

- [ ] **Step 5: Tambah `RestitusiTier` + `hitungRestitusi` (dekat `clamp01`)**

Setelah `clamp01` (baris 181-183), sebelum komentar `// ----------------------------- 1. SLA terendah -----------------------------`:

```ts
/**
 * Restitusi denda availability (Lampiran IV PKS ARTAJASA–Bank Nagari,
 * No. PKS/042/DIR/11-2024). `slaPersenFrac` pecahan 0..1. Hanya relevan
 * untuk basis SLA Eksternal (kontrak mengacu availability vendor).
 *
 * Batas 70,0% memakai `p > 70.0` (bukan `>=`) karena tabel sumber
 * tumpang-tindih tepat di titik itu — dipilih supaya 70,0% jatuh ke
 * "Bebas Biaya Bulanan" sesuai baris terakhir tabel.
 */
export interface RestitusiTier {
  restitusiPersen: number | null; // null → "Bebas Biaya Bulanan"
  label: string;
}
export function hitungRestitusi(slaPersenFrac: number): RestitusiTier {
  const p = slaPersenFrac * 100;
  if (p >= 99.5) return { restitusiPersen: 0, label: "0%" };
  if (p >= 99.0) return { restitusiPersen: 2, label: "2%" };
  if (p >= 98.0) return { restitusiPersen: 6, label: "6%" };
  if (p >= 97.0) return { restitusiPersen: 9, label: "9%" };
  if (p >= 96.0) return { restitusiPersen: 12, label: "12%" };
  if (p >= 95.0) return { restitusiPersen: 15, label: "15%" };
  if (p >= 94.0) return { restitusiPersen: 20, label: "20%" };
  if (p >= 93.0) return { restitusiPersen: 25, label: "25%" };
  if (p >= 92.0) return { restitusiPersen: 30, label: "30%" };
  if (p >= 91.0) return { restitusiPersen: 35, label: "35%" };
  if (p >= 90.0) return { restitusiPersen: 40, label: "40%" };
  if (p > 70.0) return { restitusiPersen: 60, label: "60%" };
  return { restitusiPersen: null, label: "Bebas Biaya Bulanan" };
}
```

- [ ] **Step 6: Tambah field `restitusi` ke `LowestSlaRow`**

Di interface `LowestSlaRow` (baris 187-198), tambahkan field terakhir:

```ts
export interface LowestSlaRow {
  atmId: string | null;
  kodeAtm: string;
  namaAtm: string;
  lokasi: string;
  vendor: string;
  kategori: TicketKategori | null;
  totalTiket: number;
  totalDowntimeMenit: number;
  slaPersen: number; // 0..1
  slaPersenLabel: string; // "99.86%"
  restitusi?: RestitusiTier; // hanya terisi saat basis eksternal
}
```

- [ ] **Step 7: `getLowestSla` menerima `basis`, filter `rowsUsed`, lampirkan restitusi**

Ganti seluruh fungsi (baris 206-256):

```ts
export async function getLowestSla(
  filter: SlaFilter,
  basis: SlaBasis = "internal"
): Promise<LowestSlaResponse> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  const rows = await prisma.ticket.findMany({
    where: buildWhere(range, filter.kategori, true),
    select: ticketSelect,
  });
  // Basis eksternal: ATM yang TIDAK PERNAH punya tiket dgn No Tiket Vendor
  // terisi pada periode ini dikecualikan (N/A), bukan dihitung 100%.
  const rowsUsed =
    basis === "eksternal" ? rows.filter((t) => t.waktuLaporVendor !== null) : rows;

  const groups = new Map<
    string,
    { atm: AtmInfo; atmId: string | null; kategori: TicketKategori; tiket: number; downtime: number }
  >();
  for (const t of rowsUsed) {
    const key = atmKey(t);
    const dt = downtimeMenit(t, basis)!; // rowsUsed sudah dijamin non-null utk eksternal
    const g = groups.get(key);
    if (g) {
      g.tiket += 1;
      g.downtime += dt;
    } else {
      groups.set(key, {
        atm: t.atm,
        atmId: t.atmId,
        kategori: t.kategori,
        tiket: 1,
        downtime: dt,
      });
    }
  }

  const items: LowestSlaRow[] = [...groups.values()]
    .map((g) => {
      const sla = clamp01(
        (range.totalMenitPeriode - g.downtime) / range.totalMenitPeriode
      );
      return {
        atmId: g.atmId,
        kodeAtm: atmKode(g.atm),
        namaAtm: atmNama(g.atm),
        lokasi: atmLokasi(g.atm),
        vendor: atmVendor(g.atm),
        kategori: g.kategori,
        totalTiket: g.tiket,
        totalDowntimeMenit: g.downtime,
        slaPersen: sla,
        slaPersenLabel: formatSlaPersen(sla),
        ...(basis === "eksternal" ? { restitusi: hitungRestitusi(sla) } : {}),
      };
    })
    .sort((a, b) => a.slaPersen - b.slaPersen)
    .slice(0, 20);

  return { filter, totalMenitPeriode: range.totalMenitPeriode, items };
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run lib/__tests__/slaMonitoring.test.ts
```

Expected: PASS (semua describe block `hitungRestitusi` + `getLowestSla`).

- [ ] **Step 9: `tsc --noEmit` (dua caller lama `downtimeMenit(t)` belum diupdate — akan diperbaiki Task 5, error di sana DIPERBOLEHKAN sementara)**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task4.log 2>&1; grep "slaMonitoring.ts" /tmp/tsc-task4.log
```

Expected: persis 2 error "Expected 2 arguments, but got 1" — satu di `getProblemReport` (pemanggilan `downtimeMenit(t as unknown as TicketRow)`), satu di `getSlaSummary` (pemanggilan `downtimeMenit(t)` di dalam loop akumulasi). Keduanya diperbaiki di Task 5 Step 1 & Step 5. Kalau ada error LAIN di luar dua ini, berhenti dan investigasi sebelum lanjut.

- [ ] **Step 10: Commit**

```bash
git add lib/slaMonitoring.ts lib/__tests__/slaMonitoring.test.ts
git commit -m "feat(sla): basis Internal/Eksternal + restitusi di getLowestSla"
```

---

### Task 5: `lib/slaMonitoring.ts` — `parseSlaBasis`, `getSlaSummary` basis, fix `getProblemReport`

**Files:**
- Modify: `lib/slaMonitoring.ts` (dekat `parseSlaFilters`, fungsi `getProblemReport`, fungsi `getSlaSummary`)
- Test: `lib/__tests__/slaMonitoring.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: `SlaBasis`, `downtimeMenit(t, basis)`, `ticketSelect` (Task 4)
- Produces (dipakai Task 6):
  - `export type ParsedSlaBasis = { ok: true; basis: SlaBasis } | { ok: false; error: string };`
  - `export function parseSlaBasis(sp: URLSearchParams): ParsedSlaBasis`
  - `getSlaSummary(filter: SlaFilter, basis?: SlaBasis): Promise<SlaSummary>` (basis default `"internal"`)

- [ ] **Step 1: Perbaiki `getProblemReport` agar cocok dengan `downtimeMenit` baru (basis internal, TIDAK berubah fungsionalitasnya)**

`getProblemReport` (bagian "6. Laporan Permasalahan") TIDAK ikut basis toggle (di luar scope UI ini), tapi kompilasi akan gagal karena `downtimeMenit` sekarang butuh argumen kedua. Cari baris:

```ts
    g.downtime += downtimeMenit(t as unknown as TicketRow);
```

Ganti menjadi (basis internal — perilaku sebelumnya, tidak berubah):

```ts
    g.downtime += downtimeMenit(t as unknown as TicketRow, "internal") ?? 0;
```

- [ ] **Step 2: Tulis test yang gagal untuk `parseSlaBasis` & `getSlaSummary`**

Tambahkan ke `lib/__tests__/slaMonitoring.test.ts` (setelah blok `getLowestSla — basis eksternal` yang sudah ada di Task 4):

```ts
describe("parseSlaBasis", () => {
  it("tanpa param → default internal", async () => {
    const { parseSlaBasis } = await import("../slaMonitoring");
    const res = parseSlaBasis(new URLSearchParams());
    expect(res).toEqual({ ok: true, basis: "internal" });
  });
  it("basis=eksternal valid", async () => {
    const { parseSlaBasis } = await import("../slaMonitoring");
    const res = parseSlaBasis(new URLSearchParams("basis=eksternal"));
    expect(res).toEqual({ ok: true, basis: "eksternal" });
  });
  it("nilai tidak valid → error", async () => {
    const { parseSlaBasis } = await import("../slaMonitoring");
    const res = parseSlaBasis(new URLSearchParams("basis=lainnya"));
    expect(res.ok).toBe(false);
  });
});

describe("getSlaSummary — basis internal vs eksternal", () => {
  it("basis internal: semua tiket dihitung, downtime dari waktuOpen", async () => {
    const { getSlaSummary } = await import("../slaMonitoring");
    const res = await getSlaSummary({ dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" });
    expect(res.totalTiket).toBe(2);
    expect(res.totalDowntimeMenit).toBe(180); // 60 (A1) + 120 (A2)
  });

  it("basis eksternal: hanya tiket ber-waktuLaporVendor dihitung", async () => {
    const { getSlaSummary } = await import("../slaMonitoring");
    const res = await getSlaSummary(
      { dari: "2026-08-01", sampai: "2026-08-01", kategori: "semua" },
      "eksternal"
    );
    expect(res.totalTiket).toBe(1); // hanya t-a2, t-a1 dikecualikan (N/A)
    expect(res.totalDowntimeMenit).toBe(90); // dari waktuLaporVendor, bukan waktuOpen
    expect(res.atmBermasalah).toBe(1); // A1 tidak ikut terhitung "bermasalah" di basis ini
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run lib/__tests__/slaMonitoring.test.ts
```

Expected: FAIL — `parseSlaBasis` belum ada; `getSlaSummary` belum menerima `basis` (test eksternal akan menghasilkan angka basis-internal karena diabaikan).

- [ ] **Step 4: Tambah `parseSlaBasis` setelah `parseSlaFilters`**

Setelah fungsi `parseSlaFilters` (baris 73-101), sebelum `export interface SlaRange {`:

```ts
export type ParsedSlaBasis =
  | { ok: true; basis: SlaBasis }
  | { ok: false; error: string };

/** Parse & validasi query param `?basis=internal|eksternal` (default "internal"). */
export function parseSlaBasis(sp: URLSearchParams): ParsedSlaBasis {
  const raw = sp.get("basis") ?? "internal";
  if (raw !== "internal" && raw !== "eksternal") {
    return { ok: false, error: "Basis harus internal | eksternal." };
  }
  return { ok: true, basis: raw };
}
```

- [ ] **Step 5: `getSlaSummary` menerima `basis`, filter `rowsUsed`**

Cari fungsi `export async function getSlaSummary(filter: SlaFilter): Promise<SlaSummary> {` dan ganti isinya:

```ts
export async function getSlaSummary(
  filter: SlaFilter,
  basis: SlaBasis = "internal"
): Promise<SlaSummary> {
  const range = computeSlaRange(filter.dari, filter.sampai);
  const rows = await prisma.ticket.findMany({
    where: buildWhere(range, filter.kategori, false),
    select: ticketSelect,
  });
  // Basis eksternal: sama seperti getLowestSla, tiket tanpa waktuLaporVendor
  // dikecualikan (N/A) — konsekuensinya Total Tiket/Downtime/ATM Bermasalah
  // pada basis ini HANYA menghitung tiket yang punya No Tiket Vendor.
  const rowsUsed =
    basis === "eksternal" ? rows.filter((t) => t.waktuLaporVendor !== null) : rows;

  // Akumulasi downtime per-ATM, dipisah per kategori untuk rata-rata kategori.
  type Acc = { downtime: number };
  const perAtm = new Map<string, Acc>();
  const perAtmAtm = new Map<string, Acc>();
  const perAtmJaringan = new Map<string, Acc>();

  let totalDowntime = 0;
  let totalAtm = 0;
  let totalJaringan = 0;

  const bump = (m: Map<string, Acc>, key: string, dt: number) => {
    const g = m.get(key);
    if (g) g.downtime += dt;
    else m.set(key, { downtime: dt });
  };

  for (const t of rowsUsed) {
    const key = atmKey(t);
    const dt = downtimeMenit(t, basis)!; // rowsUsed sudah dijamin non-null utk eksternal
    totalDowntime += dt;
    bump(perAtm, key, dt);
    if (t.kategori === "atm") {
      totalAtm += 1;
      bump(perAtmAtm, key, dt);
    } else {
      totalJaringan += 1;
      bump(perAtmJaringan, key, dt);
    }
  }

  const meanSla = (m: Map<string, Acc>): number => {
    if (m.size === 0) return 0;
    let sum = 0;
    for (const g of m.values()) {
      sum += clamp01(
        (range.totalMenitPeriode - g.downtime) / range.totalMenitPeriode
      );
    }
    return sum / m.size;
  };

  const rataSlaSemua = meanSla(perAtm);
  const rataSlaAtm = meanSla(perAtmAtm);
  const rataSlaJaringan = meanSla(perAtmJaringan);

  return {
    filter,
    totalMenitPeriode: range.totalMenitPeriode,
    totalTiket: rowsUsed.length,
    totalDowntimeMenit: totalDowntime,
    rataSlaSemua,
    rataSlaSemuaLabel: formatSlaPersen(rataSlaSemua),
    atmBermasalah: perAtmAtm.size,
    jaringanBermasalah: perAtmJaringan.size,
    perKategori: {
      atm: {
        totalTiket: totalAtm,
        rataSla: rataSlaAtm,
        rataSlaLabel: formatSlaPersen(rataSlaAtm),
      },
      jaringan: {
        totalTiket: totalJaringan,
        rataSla: rataSlaJaringan,
        rataSlaLabel: formatSlaPersen(rataSlaJaringan),
      },
    },
  };
}
```

(Hanya baris pertama signature, deklarasi `rowsUsed`, dan penggantian `rows` → `rowsUsed` di loop + `totalTiket: rowsUsed.length` yang berubah dari versi asli — sisanya identik.)

- [ ] **Step 6: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run lib/__tests__/slaMonitoring.test.ts
```

Expected: PASS semua (Task 4 + Task 5 test cases).

- [ ] **Step 7: `tsc --noEmit` bersih penuh**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task5.log 2>&1; echo "exit=$?"; tail -30 /tmp/tsc-task5.log
```

Expected: `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add lib/slaMonitoring.ts lib/__tests__/slaMonitoring.test.ts
git commit -m "feat(sla): basis Internal/Eksternal di getSlaSummary + parseSlaBasis"
```

---

### Task 6: API routes — wire `basis` ke `/api/sla/summary` & `/api/sla/lowest`

**Files:**
- Modify: `app/api/sla/summary/route.ts`, `app/api/sla/lowest/route.ts`

**Interfaces:**
- Consumes: `parseSlaBasis`, `getSlaSummary(filter, basis)`, `getLowestSla(filter, basis)` (Task 4, 5)
- Produces: query param `?basis=internal|eksternal` diterima kedua endpoint (default `internal`, invalid → 400). `/api/sla/most-trouble`, `/api/sla/by-jenis-gangguan`, `/api/sla/by-sumber-penyebab` TIDAK disentuh.

**Catatan konvensi:** endpoint SLA lain (`most-trouble`, `by-jenis-gangguan`, dst.) di repo ini tidak punya test route sendiri — logikanya sudah diuji lewat fungsi `lib/slaMonitoring.ts`. Task ini mengikuti pola yang sama (tidak menambah test route baru); validasi `basis` sudah diuji di Task 5 via `parseSlaBasis`.

- [ ] **Step 1: `app/api/sla/summary/route.ts`**

Ganti seluruh isi file:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, parseSlaBasis, getSlaSummary } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/summary?dari=&sampai=&kategori=&basis=internal|eksternal
 * Ringkasan umum SLA: total tiket, rata-rata SLA, total downtime, jumlah ATM &
 * jaringan bermasalah, serta rata-rata SLA per kategori.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const parsed = parseSlaFilters(sp);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const parsedBasis = parseSlaBasis(sp);
  if (!parsedBasis.ok) {
    return NextResponse.json({ error: parsedBasis.error }, { status: 400 });
  }
  const data = await getSlaSummary(parsed.filter, parsedBasis.basis);
  return NextResponse.json(data);
}
```

- [ ] **Step 2: `app/api/sla/lowest/route.ts`**

Ganti seluruh isi file:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSlaFilters, parseSlaBasis, getLowestSla } from "@/lib/slaMonitoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/lowest?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&kategori=atm|jaringan|semua&basis=internal|eksternal
 * ATM/jaringan dengan SLA periode terendah (limit 20). Lihat lib/slaMonitoring.ts.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const parsed = parseSlaFilters(sp);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const parsedBasis = parseSlaBasis(sp);
  if (!parsedBasis.ok) {
    return NextResponse.json({ error: parsedBasis.error }, { status: 400 });
  }
  const data = await getLowestSla(parsed.filter, parsedBasis.basis);
  return NextResponse.json(data);
}
```

- [ ] **Step 3: `tsc --noEmit`**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task6.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc-task6.log
```

Expected: `exit=0`.

- [ ] **Step 4: Verifikasi manual cepat (server dev harus jalan)**

```bash
curl -s "http://localhost:3000/api/sla/summary?basis=lainnya" -b <cookie-session-valid>
```

Expected: `400` dengan `{"error":"Basis harus internal | eksternal."}`. (Skip langkah ini kalau tidak ada sesi login aktif untuk curl — cukup verifikasi lewat UI di Task 8.)

- [ ] **Step 5: Commit**

```bash
git add app/api/sla/summary/route.ts app/api/sla/lowest/route.ts
git commit -m "feat(sla): terima query param basis di endpoint summary & lowest"
```

---

### Task 7: UI — toggle Internal/Eksternal + kolom Restitusi

**Files:**
- Modify: `components/monitoring-sla/MonitoringSlaClient.tsx`

**Interfaces:**
- Consumes: query param `basis` diterima `/api/sla/summary` & `/api/sla/lowest` (Task 6); `LowestSlaRow.restitusi?: RestitusiTier` bentuk `{ restitusiPersen: number | null; label: string }` (Task 4)
- Produces: —

- [ ] **Step 1: Tambah tipe `SlaBasis` & field `restitusi` di `LowestRow`**

Setelah `type Kategori = "semua" | "atm" | "jaringan";` (baris 80):

```ts
type Kategori = "semua" | "atm" | "jaringan";
type SlaBasis = "internal" | "eksternal";
```

Ubah interface `LowestRow` (baris 40-49) — tambah field terakhir:

```ts
interface LowestRow {
  atmId: string | null;
  kodeAtm: string;
  lokasi: string;
  vendor: string;
  totalTiket: number;
  totalDowntimeMenit: number;
  slaPersen: number;
  slaPersenLabel: string;
  restitusi?: { restitusiPersen: number | null; label: string };
}
```

- [ ] **Step 2: State `basis` + reload query string basis untuk summary/lowest saja**

Tambah state setelah `const [preset, setPreset] = useState<Preset>("30d");` (baris 114):

```ts
  const [preset, setPreset] = useState<Preset>("30d");
  const [basis, setBasis] = useState<SlaBasis>("internal");
```

Ganti fungsi `load` (baris 121-152):

```ts
  const load = useCallback(
    async (f: { dari: string; sampai: string; kategori: Kategori; basis: SlaBasis }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          dari: f.dari,
          sampai: f.sampai,
          kategori: f.kategori,
        }).toString();
        const qsBasis = new URLSearchParams({
          dari: f.dari,
          sampai: f.sampai,
          kategori: f.kategori,
          basis: f.basis,
        }).toString();
        const [summary, lowest, mostTrouble, byJenis, bySumber] = await Promise.all([
          fetch(`/api/sla/summary?${qsBasis}`).then(okJson),
          fetch(`/api/sla/lowest?${qsBasis}`).then(okJson),
          fetch(`/api/sla/most-trouble?${qs}`).then(okJson),
          fetch(`/api/sla/by-jenis-gangguan?${qs}`).then(okJson),
          fetch(`/api/sla/by-sumber-penyebab?${qs}`).then(okJson),
        ]);
        setData({
          summary,
          lowest: lowest.items ?? [],
          mostTrouble: mostTrouble.items ?? [],
          byJenis: { total: byJenis.total ?? 0, items: byJenis.items ?? [] },
          bySumber: { total: bySumber.total ?? 0, items: bySumber.items ?? [] },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data SLA.");
      } finally {
        setLoading(false);
      }
    },
    []
  );
```

- [ ] **Step 3: Update pemanggil `load()` — initial load, preset, filter, toggle basis**

Ganti `useEffect` awal (baris 155-157):

```ts
  useEffect(() => {
    load({ dari: init.current.dari, sampai: init.current.sampai, kategori: "semua", basis: "internal" });
  }, [load]);
```

Ganti `applyPreset` (baris 159-168):

```ts
  function applyPreset(p: Exclude<Preset, "custom">) {
    const today = new Date();
    const todayKey = dateKey(today);
    const back = p === "7d" ? 6 : p === "30d" ? 29 : 89;
    const fromKey = dateKey(new Date(today.getTime() - back * DAY_MS));
    setDari(fromKey);
    setSampai(todayKey);
    setPreset(p);
    load({ dari: fromKey, sampai: todayKey, kategori, basis });
  }
```

Ganti `applyFilter` (baris 170-172):

```ts
  function applyFilter() {
    load({ dari, sampai, kategori, basis });
  }
```

Tambah fungsi baru setelah `applyFilter`:

```ts
  function applyBasis(b: SlaBasis) {
    setBasis(b);
    load({ dari, sampai, kategori, basis: b });
  }
```

- [ ] **Step 4: Toggle UI di filter bar**

Di filter bar (baris 180-191), tambah blok toggle basis setelah blok preset tanggal, sebelum input rentang tanggal:

```tsx
          <div className="flex items-center gap-1">
            <PresetButton active={preset === "7d"} onClick={() => applyPreset("7d")}>
              7 Hari
            </PresetButton>
            <PresetButton active={preset === "30d"} onClick={() => applyPreset("30d")}>
              30 Hari
            </PresetButton>
            <PresetButton active={preset === "3m"} onClick={() => applyPreset("3m")}>
              3 Bulan
            </PresetButton>
          </div>

          <div className="flex items-center gap-1">
            <PresetButton active={basis === "internal"} onClick={() => applyBasis("internal")}>
              SLA Internal
            </PresetButton>
            <PresetButton active={basis === "eksternal"} onClick={() => applyBasis("eksternal")}>
              SLA Eksternal
            </PresetButton>
          </div>
```

- [ ] **Step 5: Sub-label basis di `SlaSummaryCard`**

Ganti pemanggilan komponen (baris 283):

```tsx
              <SlaSummaryCard summary={data.summary} basis={basis} />
```

Ganti definisi `SlaSummaryCard` (baris 773-788):

```tsx
function SlaSummaryCard({ summary, basis }: { summary: SlaSummary; basis: SlaBasis }) {
  const tone = slaCardTone(summary.rataSlaSemua);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}>
        <Gauge className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className={`text-xl font-bold leading-tight ${tone.text}`}>
          {summary.rataSlaSemuaLabel}
        </div>
        <div className="text-xs text-gray-500">
          Rata-rata SLA Keseluruhan
          <span className="ml-1 text-gray-400">
            ({basis === "internal" ? "Internal" : "Eksternal"})
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Subtitle & kolom Restitusi di tabel "SLA Terendah"**

Ganti `<Card title="SLA Terendah" ...>` beserta isi tabelnya (baris 310-358):

```tsx
            <Card
              title="SLA Terendah"
              subtitle={
                basis === "eksternal"
                  ? "ATM/lokasi paling bermasalah pada periode (basis: Eksternal — vendor)"
                  : "ATM/lokasi paling bermasalah pada periode"
              }
            >
              <Table>
                <TableHead>
                  <TableRow>
                    <Th className="w-12">Rank</Th>
                    <Th>Kode ATM</Th>
                    <Th>Lokasi</Th>
                    <Th>Vendor</Th>
                    <Th className="text-right">Total Tiket</Th>
                    <Th className="text-right">Downtime</Th>
                    <Th className="text-right">SLA%</Th>
                    {basis === "eksternal" && <Th className="text-right">Restitusi</Th>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lowest.length === 0 ? (
                    <TableRow>
                      <Td colSpan={basis === "eksternal" ? 8 : 7} className="py-8 text-center text-gray-400">
                        Tidak ada tiket selesai pada rentang ini.
                      </Td>
                    </TableRow>
                  ) : (
                    data.lowest.map((r, i) => (
                      <TableRow
                        key={(r.atmId ?? r.kodeAtm) + i}
                        className={i < 3 ? "bg-red-50/50" : undefined}
                      >
                        <Td>
                          <RankBadge rank={i + 1} highlight={i < 3} />
                        </Td>
                        <Td className="font-mono font-semibold text-gray-900">
                          {r.kodeAtm}
                        </Td>
                        <Td className="max-w-[16rem] truncate text-gray-600">
                          {r.lokasi}
                        </Td>
                        <Td className="text-gray-600">{r.vendor}</Td>
                        <Td className="text-right">{r.totalTiket}</Td>
                        <Td className="text-right font-mono text-xs">
                          {menitToHHMM(r.totalDowntimeMenit)}
                        </Td>
                        <Td className={`text-right font-semibold ${slaTone(r.slaPersen)}`}>
                          {r.slaPersenLabel}
                        </Td>
                        {basis === "eksternal" && (
                          <Td className="text-right text-gray-700">
                            {r.restitusi?.label ?? "-"}
                          </Td>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
```

- [ ] **Step 7: `tsc --noEmit`**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task7.log 2>&1; echo "exit=$?"; tail -30 /tmp/tsc-task7.log
```

Expected: `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add components/monitoring-sla/MonitoringSlaClient.tsx
git commit -m "feat(sla): toggle SLA Internal/Eksternal + kolom Restitusi di UI Monitoring SLA"
```

---

### Task 8: Verifikasi end-to-end

**Files:** — (tidak ada perubahan kode; checklist manual)

**Interfaces:**
- Consumes: seluruh Task 1-7
- Produces: —

- [ ] **Step 1: Suite penuh**

```bash
./node_modules/.bin/vitest run > /tmp/vitest-final.log 2>&1; echo "exit=$?"; tail -40 /tmp/vitest-final.log
```

Expected: `exit=0`, semua test lulus (termasuk test lama yang tidak disentuh, mis. `closeTicket.test.ts`, `sla.test.ts`).

- [ ] **Step 2: Typecheck penuh**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-final.log 2>&1; echo "exit=$?"; tail -40 /tmp/tsc-final.log
```

Expected: `exit=0`.

- [ ] **Step 3: Test manual DB — create & immutability**

1. Jalankan `./node_modules/.bin/next dev`, login, buka Open Tiket baru TANPA isi No Tiket Vendor.
2. Cek row tiket di DB (mis. lewat Database Studio internal `/database-studio` atau `prisma studio`) → `waktu_lapor_vendor` harus `NULL`.
3. Edit tiket itu, isi No Tiket Vendor → cek `waktu_lapor_vendor` terisi timestamp saat ini.
4. Edit lagi, ganti nomor vendor ke nilai lain → cek `waktu_lapor_vendor` TIDAK berubah (tetap timestamp pertama).

- [ ] **Step 4: Test manual UI — toggle & restitusi**

1. Buka Monitoring SLA, pastikan default toggle = "SLA Internal" dan angka sama seperti sebelum perubahan (regresi).
2. Klik "SLA Eksternal" → pastikan kartu ringkasan & tabel "SLA Terendah" berubah TANPA klik "Terapkan Filter" lagi (reload otomatis).
3. Pastikan ATM yang tidak pernah punya tiket dengan No Tiket Vendor terisi pada periode itu HILANG dari tabel (bukan muncul dengan SLA 100%).
4. Pastikan kolom "Restitusi" hanya muncul saat basis Eksternal, dan nilainya cocok manual cross-check 1-2 baris terhadap tabel tier di Lampiran IV (mis. SLA 99.6% → "0%", SLA 96.5% → "12%").
5. Pastikan tabel "Paling Sering Bermasalah" & kedua donut chart TIDAK berubah saat toggle basis diganti.

- [ ] **Step 5: Redeploy VM (kalau relevan sekarang)**

Migration harus dijalankan manual di VM produksi — image standalone tidak bawa CLI prisma. Build ulang `--target builder`, jalankan `prisma migrate deploy` lewat `--network container:mtr_app` (lihat catatan redeploy VM sebelumnya), baru restart container app.
