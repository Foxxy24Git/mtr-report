# Stop/Start SLA Eksternal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Petugas Daily Monitoring bisa menghentikan sementara ("Stop") dan
melanjutkan lagi ("Start") hitungan SLA Eksternal pada tiket "Proses",
berkali-kali dalam satu insiden, dengan jejak riwayat lengkap.

**Architecture:** Tabel append-only baru `TicketSlaEpisode` mencatat tiap
perpindahan (basis + waktu + catatan opsional). Mesin hitung yang sudah ada
(`downtimeMenit()` di `lib/slaMonitoring.ts`) diperluas dari "1 titik
potong" jadi "menyusuri garis waktu penuh" — kalau tidak ada episode sama
sekali, hasilnya identik dengan sebelum fitur ini ada (regresi aman). Dua
endpoint baru (`/sla-eksternal/stop`, `/start`) ikut pola dedicated-action
yang sudah ada (`/close`, `/reopen`). UI di `TicketDetailClient.tsx`.

**Tech Stack:** Next.js 15 (App Router) · Prisma 6 + PostgreSQL · Vitest · TypeScript · Tailwind v3

**Spec:** `docs/superpowers/specs/2026-09-19-sla-eksternal-stop-start-design.md`

## Global Constraints

- **Pakai binary lokal, BUKAN `npx`** (hook RTK dapat merusak `npx`): `./node_modules/.bin/prisma`, `./node_modules/.bin/tsc`, `./node_modules/.bin/vitest`, `./node_modules/.bin/eslint`.
- **`TicketSlaEpisode` append-only** — TIDAK ADA endpoint edit/hapus baris. Salah pencet → tinggal stop/start lagi.
- **Fitur HANYA untuk tiket status "Proses".** Tiket "Selesai" tetap lewat jalur Super Admin (`app/api/tickets/[id]/route.ts` PATCH) yang sudah ada — JANGAN disentuh.
- **Waktu stop/start SELALU `now()`** — TIDAK ADA input jam manual untuk aksi ini.
- **`catatan` OPSIONAL** saat "Stop" (bukan wajib). "Start" TIDAK punya input tambahan sama sekali.
- **Signature publik `getLowestSla`/`getSlaSummary`/`getProblemReport`/`getSlaDrilldownTickets` TIDAK BERUBAH** — hanya `select` Prisma internal & `downtimeMenit()` yang berubah. Jangan ubah pemanggil di luar `lib/slaMonitoring.ts`.
- Komentar kode & UI copy berbahasa Indonesia, ikut konvensi repo.
- Status badge UI pakai komponen `Badge` (`variant="success"|"warning"`) — BUKAN emoji, ikut konvensi yang sudah ada di `TicketDetailClient.tsx` untuk status tiket.
- Jalankan `./node_modules/.bin/vitest run` dan `./node_modules/.bin/tsc --noEmit` sebelum tiap commit; laporkan hasilnya.

## Review Focus

- Tiket dengan `waktuLaporVendor` valid tapi **belum pernah** di-stop (0 baris `TicketSlaEpisode`) — harus dianggap "sedang Eksternal" (state default), bukan error atau salah dianggap Internal.
- Dua kali klik "Stop" berturut-turut pada tiket yang sama (double-click / race) — permintaan kedua HARUS ditolak 409, bukan membuat 2 baris `internal` berturutan yang merusak asumsi "basis berganti-ganti" di mesin hitung.
- Konsumen SELAIN `getLowestSla` (terutama `getProblemReport`/Excel — `problemSelect` sebelumnya TIDAK menyeleksi `waktuLaporVendor` sama sekali, jadi diam-diam salah sejak fitur Internal/Eksternal sekuensial dibuat) ikut menghitung benar untuk tiket ber-episode.
- Petugas yang BUKAN pemilik/shift-holder tiket mencoba panggil endpoint stop/start langsung (bukan lewat UI) — harus tetap ditolak `guardTicketMutation` yang sudah ada.
- Tiket yang ditutup ("Selesai") persis saat episode terakhirnya masih `internal` tanpa sempat di-"start" lagi — segmen terakhir itu harus otomatis dianggap berjalan sampai `waktuSelesai` (bukan durasi 0 atau error).

---

### Task 1: Skema Prisma — `SlaEpisodeBasis` enum + model `TicketSlaEpisode`

**Files:**
- Modify: `prisma/schema.prisma:132` (blok relasi `model User`), `:239-292` (`model Ticket`, blok relasi baris 276-285), tambah model baru setelah `model TicketActivityRevision` (baris ~332)
- Create: `prisma/migrations/<timestamp>_add_ticket_sla_episode/migration.sql` (dihasilkan Prisma)

**Interfaces:**
- Consumes: —
- Produces: model `TicketSlaEpisode` (field `id, ticketId, basis, mulai, catatan, dibuatOlehId, createdAt`), relasi `Ticket.slaEpisodes`, `User.slaEpisodesDibuat`. Dipakai Task 2, 3, 4.

- [ ] **Step 1: Tambah enum & model baru**

Di `prisma/schema.prisma`, sisipkan blok berikut PERSIS SETELAH `model TicketActivityRevision` (yang berakhir dengan `@@map("ticket_activity_revisions")\n}` di sekitar baris 332):

```prisma
enum SlaEpisodeBasis {
  internal
  eksternal
}

// Riwayat perpindahan basis SLA Eksternal<->Internal pada satu tiket
// (mis. PIC vendor tidak bisa dihubungi sementara). Append-only — tidak ada
// endpoint edit/hapus. TIDAK ADA kolom "selesai": akhir satu episode =
// mulai-nya episode berikutnya (atau waktuSelesai tiket kalau ini episode
// terakhir). Lihat lib/slaMonitoring.ts (downtimeMenit/basisSaatIni).
model TicketSlaEpisode {
  id           String          @id @default(cuid())
  ticketId     String          @map("ticket_id")
  basis        SlaEpisodeBasis
  mulai        DateTime        @default(now())
  catatan      String?
  dibuatOlehId String          @map("dibuat_oleh_id")
  createdAt    DateTime        @default(now()) @map("created_at")

  ticket     Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  dibuatOleh User   @relation(fields: [dibuatOlehId], references: [id])

  @@index([ticketId])
  @@map("ticket_sla_episodes")
}
```

- [ ] **Step 2: Tambah relasi di `model Ticket`**

Baris 282 saat ini:
```prisma
  activities       TicketActivity[]
  handovers        ShiftHandover[]
  notifications    Notification[]
  revisionRequests ActivityRevisionRequest[]
```
Ganti jadi:
```prisma
  activities       TicketActivity[]
  handovers        ShiftHandover[]
  notifications    Notification[]
  revisionRequests ActivityRevisionRequest[]
  slaEpisodes      TicketSlaEpisode[]
```

- [ ] **Step 3: Tambah relasi di `model User`**

Baris 132 saat ini:
```prisma
  activities                TicketActivity[]
  activitiesEdited          TicketActivity[]          @relation("ActivityEditor")
```
Ganti jadi:
```prisma
  activities                TicketActivity[]
  activitiesEdited          TicketActivity[]          @relation("ActivityEditor")
  slaEpisodesDibuat         TicketSlaEpisode[]
```

- [ ] **Step 4: Jalankan migrasi**

```bash
./node_modules/.bin/prisma migrate dev --name add_ticket_sla_episode
```

Expected: migrasi baru terbuat, `prisma generate` jalan otomatis, TIDAK ada prompt data-loss (tabel baru, tanpa kolom wajib berdefault di tabel lama).

- [ ] **Step 5: Verifikasi tipe Prisma Client ter-generate**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task1.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc-task1.log
```

Expected: `exit=0` (model baru belum dipakai kode mana pun).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): tambah tabel ticket_sla_episodes untuk stop/start SLA Eksternal"
```

---

### Task 2: Mesin hitung multi-episode — `lib/slaMonitoring.ts`

**Files:**
- Modify: `lib/slaMonitoring.ts` (`ticketSelect` baris 149-168, `downtimeMenit` baris 214-238, `problemSelect` baris 510-528, `drilldownSelect` baris 750-763)
- Test: `lib/__tests__/slaMonitoring.test.ts`

**Interfaces:**
- Consumes: `TicketSlaEpisode` (Task 1)
- Produces (dipakai Task 3, 4):
  - `export type SlaBasis = "internal" | "eksternal";` (SUDAH ADA, tidak berubah)
  - `export function basisSaatIni(latestEpisode: { basis: SlaBasis } | null): SlaBasis`
  - `downtimeMenit()` (privat) sekarang membaca `t.slaEpisodes` — signature TIDAK berubah (`(t: TicketRow, basis: SlaBasis) => number | null`)

- [ ] **Step 1: Tulis test yang gagal untuk `basisSaatIni` & mesin hitung multi-episode**

Tambahkan ke `lib/__tests__/slaMonitoring.test.ts`, PALING BAWAH file (setelah blok `describe("getSlaDrilldownTickets", ...)` yang sudah ada):

```ts
describe("basisSaatIni", () => {
  it("tanpa episode sama sekali → eksternal (keadaan sejak waktuLaporVendor pertama)", async () => {
    const { basisSaatIni } = await import("../slaMonitoring");
    expect(basisSaatIni(null)).toBe("eksternal");
  });
  it("episode terakhir basis internal → internal", async () => {
    const { basisSaatIni } = await import("../slaMonitoring");
    expect(basisSaatIni({ basis: "internal" })).toBe("internal");
  });
  it("episode terakhir basis eksternal → eksternal", async () => {
    const { basisSaatIni } = await import("../slaMonitoring");
    expect(basisSaatIni({ basis: "eksternal" })).toBe("eksternal");
  });
});

// --- Multi-episode: stop/start berkali-kali pada satu tiket ------------------
// t-multi: waktuOpen 08:00 → waktuLaporVendor 08:20 → stop#1 09:00 →
// start#1 09:30 → stop#2 11:00 → (tidak start lagi) → waktuSelesai 12:00.
// Segmen: [08:00-08:20]=internal 20 | [08:20-09:00]=eksternal 40 |
// [09:00-09:30]=internal 30 | [09:30-11:00]=eksternal 90 |
// [11:00-12:00]=internal 60 (episode terakhir, jalan sampai waktuSelesai).
// Total internal = 20+30+60 = 110. Total eksternal = 40+90 = 130. Jumlah = 240
// (= 08:00→12:00, PERSIS durasi penuh tiket — tidak ada menit yang hilang).
const ATM_MULTI = {
  id: "atm-multi",
  kodeAtm: "AM1",
  namaAtm: "ATM Multi Episode",
  cabang: null,
  alamat: null,
  vendorAtm: null,
  vendorJaringan: null,
};

const ROWS_MULTI_EPISODE = [
  {
    id: "t-multi",
    atmId: "atm-multi",
    kategori: "atm",
    status: "selesai",
    waktuOpen: new Date("2026-09-01T08:00:00+07:00"),
    waktuSelesai: new Date("2026-09-01T12:00:00+07:00"),
    noTiketVendor: "VDR-MULTI",
    waktuLaporVendor: new Date("2026-09-01T08:20:00+07:00"),
    slaEpisodes: [
      { basis: "internal", mulai: new Date("2026-09-01T09:00:00+07:00") },
      { basis: "eksternal", mulai: new Date("2026-09-01T09:30:00+07:00") },
      { basis: "internal", mulai: new Date("2026-09-01T11:00:00+07:00") },
    ],
    atm: ATM_MULTI,
  },
];

describe("downtimeMenit — multi-episode (stop/start berkali-kali)", () => {
  withRows(ROWS_MULTI_EPISODE);

  it("internal + eksternal = durasi penuh tiket, dipecah di tiap titik stop/start", async () => {
    const { getLowestSla } = await import("../slaMonitoring");
    const resInternal = await getLowestSla({
      dari: "2026-09-01",
      sampai: "2026-09-01",
      kategori: "semua",
    });
    const resEksternal = await getLowestSla(
      { dari: "2026-09-01", sampai: "2026-09-01", kategori: "semua" },
      "eksternal"
    );
    expect(resInternal.items[0].totalDowntimeMenit).toBe(110);
    expect(resEksternal.items[0].totalDowntimeMenit).toBe(130);
    expect(
      resInternal.items[0].totalDowntimeMenit +
        resEksternal.items[0].totalDowntimeMenit
    ).toBe(240);
  });

  // getLowestSla di atas membuktikan mesin hitungnya benar. Test ini
  // membuktikan KONSUMEN LAIN (bukan cuma getLowestSla) benar-benar ikut
  // memakai angka yang sama — terutama getProblemReport, yang select-nya
  // (problemSelect) SEBELUM Task ini diam-diam TIDAK menyeleksi
  // waktuLaporVendor sama sekali (lihat Step 6), jadi tanpa test ini bug
  // semacam itu bisa lolos lagi tanpa ketahuan.
  it("getProblemReport (Excel 'Permasalahan') ikut basis internal sekuensial multi-episode — bukti fix problemSelect", async () => {
    const { getProblemReport } = await import("../slaMonitoring");
    const res = await getProblemReport(
      { dari: "2026-09-01", sampai: "2026-09-01", kategori: "semua" },
      "frekuensi"
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].totalDowntimeMenit).toBe(110);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run lib/__tests__/slaMonitoring.test.ts
```

Expected: FAIL — `basisSaatIni` belum ada (import error); test multi-episode menghasilkan angka lama (110/130 tidak tercapai, karena `slaEpisodes` diabaikan & fixture lama tanpa field itu bisa crash "Cannot read properties of undefined (reading 'map')" begitu Step 3 mulai membaca `t.slaEpisodes`); test `getProblemReport` gagal juga karena `problemSelect` belum punya `waktuLaporVendor`/`slaEpisodes` (Step 6 belum dikerjakan).

- [ ] **Step 3: Buat mock `findMany` selalu sediakan `slaEpisodes: []` default**

Supaya SEMUA fixture lama di file ini (yang belum punya field `slaEpisodes`) tetap aman begitu `downtimeMenit` mulai membacanya — tanpa perlu mengedit satu-satu tiap fixture. Cari (dekat baris 83-85 saat ini):

```ts
vi.mock("../prisma", () => ({
  prisma: { ticket: { findMany: async () => mockRows } },
}));
```

Ganti jadi:

```ts
vi.mock("../prisma", () => ({
  prisma: {
    ticket: {
      // Default slaEpisodes: [] utk fixture lama yang belum punya field ini —
      // ...r di belakang supaya fixture yang SUDAH set slaEpisodes sendiri
      // (mis. ROWS_MULTI_EPISODE) tetap menang (override default).
      findMany: async () =>
        mockRows.map((r) => ({ slaEpisodes: [], ...(r as object) })),
    },
  },
}));
```

- [ ] **Step 4: Tambah `basisSaatIni` + `slaEpisodes` ke `ticketSelect`**

Setelah fungsi `adaBasisEksternal` (baris 206-212), SEBELUM docstring `downtimeMenit` (baris 214), sisipkan:

```ts
/**
 * Basis SLA yang sedang berjalan SAAT INI untuk satu tiket, berdasarkan
 * episode `TicketSlaEpisode` PALING TERAKHIR (null = belum pernah stop
 * sama sekali). SATU-SATUNYA tempat state machine ini didefinisikan —
 * dipakai endpoint stop/start (lib Task 4) & tampilan status di UI
 * (Task 3/5). Cuma valid dipanggil untuk tiket yang `waktuLaporVendor`-nya
 * sudah terisi — pemanggil wajib cek itu duluan (fungsi ini tidak tahu
 * apakah tiket pernah lapor vendor sama sekali).
 */
export function basisSaatIni(
  latestEpisode: { basis: SlaBasis } | null
): SlaBasis {
  return latestEpisode ? latestEpisode.basis : "eksternal";
}
```

Lalu ubah `ticketSelect` (baris 149-168) — tambahkan `slaEpisodes`:

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
  slaEpisodes: {
    select: { basis: true, mulai: true },
    orderBy: { mulai: "asc" },
  },
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

- [ ] **Step 5: Ganti `downtimeMenit` jadi menyusuri garis waktu penuh**

Ganti seluruh fungsi (baris 214-238, docstring + body):

```ts
/**
 * Total menit per basis (internal/eksternal) untuk satu tiket, menyusuri
 * garis waktu penuh: waktuOpen (internal) → waktuLaporVendor (eksternal,
 * kalau ada & sah) → tiap TicketSlaEpisode berurutan (basis berganti-ganti
 * sesuai stop/start) → waktuSelesai. Tiket TANPA episode sama sekali
 * menghasilkan angka IDENTIK dengan sebelum fitur stop/start ada (regresi
 * aman) — hanya 2 segmen: [waktuOpen,waktuLaporVendor)=internal,
 * [waktuLaporVendor,waktuSelesai)=eksternal.
 */
function hitungMenitPerBasis(
  t: TicketRow
): { internal: number; eksternal: number } {
  if (t.status !== "selesai") return { internal: 0, eksternal: 0 };
  if (!adaBasisEksternal(t)) {
    return {
      internal: computeSla(t.waktuOpen, t.waktuSelesai).lamaMenit ?? 0,
      eksternal: 0,
    };
  }
  const breakpoints: { at: Date; basis: SlaBasis }[] = [
    { at: t.waktuOpen, basis: "internal" },
    { at: t.waktuLaporVendor!, basis: "eksternal" },
    ...t.slaEpisodes.map((e) => ({ at: e.mulai, basis: e.basis as SlaBasis })),
  ];
  let internal = 0;
  let eksternal = 0;
  for (let i = 0; i < breakpoints.length; i++) {
    const mulai = breakpoints[i].at;
    const akhir = breakpoints[i + 1]?.at ?? t.waktuSelesai;
    const menit = computeSla(mulai, akhir).lamaMenit ?? 0;
    if (breakpoints[i].basis === "internal") internal += menit;
    else eksternal += menit;
  }
  return { internal, eksternal };
}

/**
 * Downtime (menit) satu tiket untuk basis SLA yang diminta. Internal &
 * Eksternal bersifat SEKUENSIAL/KOMPLEMENTER (lihat `hitungMenitPerBasis`)
 * — tanggung jawab SLA berpindah bolak-balik persis di titik
 * waktuLaporVendor / tiap `TicketSlaEpisode`. Tiket yang tidak lolos
 * `adaBasisEksternal()` → `null` = N/A untuk basis eksternal, dikecualikan
 * dari grouping, BUKAN dihitung sebagai downtime 0/100%.
 */
function downtimeMenit(t: TicketRow, basis: SlaBasis): number | null {
  if (basis === "eksternal" && !adaBasisEksternal(t)) return null;
  return hitungMenitPerBasis(t)[basis];
}
```

- [ ] **Step 6: Perbaiki `problemSelect` — tambah `waktuLaporVendor` (bug lama) + `slaEpisodes`**

`problemSelect` (baris 510-528) SEBELUMNYA TIDAK menyeleksi `waktuLaporVendor` sama sekali — artinya `getProblemReport` (laporan Excel "Permasalahan") sejak fitur Internal/Eksternal sekuensial dibuat, diam-diam SELALU menghitung Internal versi lama (durasi penuh waktuOpen→waktuSelesai), bahkan untuk tiket yang sudah diserahkan ke vendor. Perbaiki sekalian karena fungsi yang sama (`downtimeMenit`) sekarang wajib punya `slaEpisodes` & `waktuLaporVendor` di row-nya:

```ts
const problemSelect = {
  atmId: true,
  kategori: true,
  status: true,
  waktuOpen: true,
  waktuSelesai: true,
  waktuLaporVendor: true,
  jenisGangguan: true,
  sumberPenyebab: true,
  slaEpisodes: {
    select: { basis: true, mulai: true },
    orderBy: { mulai: "asc" },
  },
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

- [ ] **Step 7: Tambah `slaEpisodes` ke `drilldownSelect`**

`drilldownSelect` (baris 750-763) sudah punya `waktuLaporVendor` — tinggal tambah `slaEpisodes`:

```ts
const drilldownSelect = {
  id: true,
  noTiket: true,
  atmId: true,
  kategori: true,
  status: true,
  waktuOpen: true,
  waktuSelesai: true,
  jenisGangguan: true,
  sumberPenyebab: true,
  noTiketVendor: true,
  waktuLaporVendor: true,
  slaEpisodes: {
    select: { basis: true, mulai: true },
    orderBy: { mulai: "asc" },
  },
  atm: { select: { kodeAtm: true, namaAtm: true } },
} satisfies Prisma.TicketSelect;
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run lib/__tests__/slaMonitoring.test.ts
```

Expected: PASS semua — termasuk SEMUA test lama (regresi: fixture lama tanpa `slaEpisodes` eksplisit dapat default `[]` dari Step 3, jadi hasilnya identik seperti sebelum Task ini).

- [ ] **Step 9: `tsc --noEmit` bersih penuh**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task2.log 2>&1; echo "exit=$?"; tail -30 /tmp/tsc-task2.log
```

Expected: `exit=0`.

- [ ] **Step 10: Commit**

```bash
git add lib/slaMonitoring.ts lib/__tests__/slaMonitoring.test.ts
git commit -m "feat(sla): mesin hitung multi-episode stop/start + perbaiki problemSelect yang kelupaan waktuLaporVendor"
```

---

### Task 3: `lib/ticketQueries.ts` — expose riwayat & status SLA saat ini

**Files:**
- Modify: `lib/ticketQueries.ts` (interface `TicketDetail` baris 397-437, fungsi `getTicketDetail` baris 440-536, import baris 1-8)

**Interfaces:**
- Consumes: `basisSaatIni` (Task 2), `TicketSlaEpisode` (Task 1)
- Produces (dipakai Task 5): `TicketDetail.slaEpisodes: SlaEpisodeItem[]`, `TicketDetail.statusSlaSaatIni: "internal" | "eksternal" | null` (`null` = tiket belum pernah lapor vendor, seluruh bagian UI stop/start tidak relevan)

- [ ] **Step 1: Tambah import `basisSaatIni`**

Baris 8 saat ini:
```ts
import { ShiftKode, TicketKategori, TicketStatus } from "@prisma/client";
```
Ganti jadi:
```ts
import { ShiftKode, TicketKategori, TicketStatus } from "@prisma/client";
import { basisSaatIni } from "@/lib/slaMonitoring";
```

- [ ] **Step 2: Tambah `SlaEpisodeItem` + field baru di `TicketDetail`**

Sebelum `export interface TicketDetail {` (baris 397), sisipkan:

```ts
export interface SlaEpisodeItem {
  id: string;
  basis: "internal" | "eksternal";
  mulai: Date;
  catatan: string | null;
  dibuatOlehNama: string;
}
```

Di dalam `TicketDetail` (baris 397-437), tambahkan 2 field baru persis setelah `waktuLaporVendor: Date | null;` (baris 408):

```ts
  waktuLaporVendor: Date | null;
  /** Riwayat stop/start SLA Eksternal, urut waktu (lama ke baru). */
  slaEpisodes: SlaEpisodeItem[];
  /**
   * Basis SLA yang sedang berjalan SAAT INI. `null` = tiket belum pernah
   * lapor vendor (seluruh bagian UI stop/start disembunyikan untuk kasus
   * ini — lihat TicketDetailClient.tsx).
   */
  statusSlaSaatIni: "internal" | "eksternal" | null;
```

- [ ] **Step 3: Sertakan relasi di query & map ke return**

Di `getTicketDetail` (baris 440-473), tambahkan `slaEpisodes` ke `include` — persis setelah blok `activities: {...}` (baris 449-471), sebelum penutup `},` dari `include`:

```ts
      activities: {
        orderBy: { waktu: "asc" },
        include: {
          user: { select: { nama: true } },
          editor: { select: { nama: true } },
          revisionRequests: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              events: {
                where: { catatan: { not: null } },
                orderBy: { at: "desc" },
                take: 1,
              },
            },
          },
        },
      },
      slaEpisodes: {
        orderBy: { mulai: "asc" },
        include: { dibuatOleh: { select: { nama: true } } },
      },
```

Lalu di return object (baris 476-536), tambahkan 2 field baru persis setelah `waktuLaporVendor: t.waktuLaporVendor,` (baris 487):

```ts
    waktuLaporVendor: t.waktuLaporVendor,
    slaEpisodes: t.slaEpisodes.map((e) => ({
      id: e.id,
      basis: e.basis,
      mulai: e.mulai,
      catatan: e.catatan,
      dibuatOlehNama: e.dibuatOleh.nama,
    })),
    statusSlaSaatIni: t.waktuLaporVendor
      ? basisSaatIni(t.slaEpisodes[t.slaEpisodes.length - 1] ?? null)
      : null,
```

- [ ] **Step 4: `tsc --noEmit`**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task3.log 2>&1; echo "exit=$?"; tail -30 /tmp/tsc-task3.log
```

Expected: `exit=0`. (Tidak ada test dedicated untuk file ini — tidak ada konvensi test `ticketQueries.ts` di repo ini sama sekali; perubahan murni pass-through data, divalidasi lewat Task 4 & 5.)

- [ ] **Step 5: Commit**

```bash
git add lib/ticketQueries.ts
git commit -m "feat(sla): expose riwayat & status SLA Eksternal saat ini di getTicketDetail"
```

---

### Task 4: Endpoint API — stop & start SLA Eksternal

**Files:**
- Create: `app/api/tickets/[id]/sla-eksternal/stop/route.ts`
- Create: `app/api/tickets/[id]/sla-eksternal/start/route.ts`
- Test: `app/api/tickets/__tests__/slaEksternalStop.test.ts`
- Test: `app/api/tickets/__tests__/slaEksternalStart.test.ts`

**Interfaces:**
- Consumes: `guardTicketMutation` (`lib/ticketGuard.ts`, tidak berubah), `basisSaatIni` (Task 2), model `TicketSlaEpisode` (Task 1)
- Produces: `POST /api/tickets/[id]/sla-eksternal/stop` & `.../start` — response sukses `{ ok: true }`, gagal `{ error: string }` + status code sesuai. Dipakai Task 5 (UI).

- [ ] **Step 1: Tulis test yang gagal — stop**

Buat `app/api/tickets/__tests__/slaEksternalStop.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/slaEksternalStop.test.ts
```

Expected: FAIL — `../[id]/sla-eksternal/stop/route` belum ada (module not found).

- [ ] **Step 3: Implementasikan `app/api/tickets/[id]/sla-eksternal/stop/route.ts`**

```ts
import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { basisSaatIni } from "@/lib/slaMonitoring";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/sla-eksternal/stop — hentikan sementara hitungan
 * SLA Eksternal, kembali ke Internal (mis. PIC vendor tidak bisa
 * dihubungi/eksekusi). Body opsional `{ catatan }` — alasan, tidak wajib.
 * Hanya berlaku untuk tiket status "Proses" yang sudah pernah lapor vendor.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (guard.ticket.status !== TicketStatus.proses) {
    return NextResponse.json(
      { error: "Hanya tiket berstatus Proses yang bisa diubah." },
      { status: 409 }
    );
  }
  if (!guard.ticket.waktuLaporVendor) {
    return NextResponse.json(
      { error: "Tiket ini belum pernah lapor ke vendor." },
      { status: 409 }
    );
  }

  const latest = await prisma.ticketSlaEpisode.findFirst({
    where: { ticketId: id },
    orderBy: { mulai: "desc" },
  });
  if (basisSaatIni(latest) !== "eksternal") {
    return NextResponse.json(
      { error: "SLA sudah dalam status Internal." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const catatan =
    typeof body?.catatan === "string" && body.catatan.trim()
      ? body.catatan.trim()
      : null;

  await prisma.ticketSlaEpisode.create({
    data: {
      ticketId: id,
      basis: "internal",
      catatan,
      dibuatOlehId: session.sub,
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/slaEksternalStop.test.ts
```

Expected: PASS (7/7).

- [ ] **Step 5: Tulis test yang gagal — start**

Buat `app/api/tickets/__tests__/slaEksternalStart.test.ts`:

```ts
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
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/slaEksternalStart.test.ts
```

Expected: FAIL — module belum ada.

- [ ] **Step 7: Implementasikan `app/api/tickets/[id]/sla-eksternal/start/route.ts`**

```ts
import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";
import { basisSaatIni } from "@/lib/slaMonitoring";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/sla-eksternal/start — lanjutkan lagi hitungan SLA
 * Eksternal setelah sebelumnya di-stop (mis. PIC vendor sudah bisa
 * dihubungi lagi). Tanpa body — No Tiket Vendor yang sama tetap dipakai,
 * tidak perlu diisi ulang. Hanya berlaku untuk tiket status "Proses" yang
 * sudah pernah lapor vendor DAN sedang dalam status Internal (habis stop).
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const { id } = await params;
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (guard.ticket.status !== TicketStatus.proses) {
    return NextResponse.json(
      { error: "Hanya tiket berstatus Proses yang bisa diubah." },
      { status: 409 }
    );
  }
  if (!guard.ticket.waktuLaporVendor) {
    return NextResponse.json(
      { error: "Tiket ini belum pernah lapor ke vendor." },
      { status: 409 }
    );
  }

  const latest = await prisma.ticketSlaEpisode.findFirst({
    where: { ticketId: id },
    orderBy: { mulai: "desc" },
  });
  if (basisSaatIni(latest) !== "internal") {
    return NextResponse.json(
      { error: "SLA sudah dalam status Eksternal." },
      { status: 409 }
    );
  }

  await prisma.ticketSlaEpisode.create({
    data: {
      ticketId: id,
      basis: "eksternal",
      dibuatOlehId: session.sub,
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

```bash
./node_modules/.bin/vitest run app/api/tickets/__tests__/slaEksternalStart.test.ts
```

Expected: PASS (6/6).

- [ ] **Step 9: `tsc --noEmit`**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task4.log 2>&1; echo "exit=$?"; tail -30 /tmp/tsc-task4.log
```

Expected: `exit=0`.

- [ ] **Step 10: Commit**

```bash
git add app/api/tickets/[id]/sla-eksternal app/api/tickets/__tests__/slaEksternalStop.test.ts app/api/tickets/__tests__/slaEksternalStart.test.ts
git commit -m "feat(sla): endpoint stop/start SLA Eksternal + state machine"
```

---

### Task 5: UI — `TicketDetailClient.tsx`

**Files:**
- Modify: `components/daily-monitoring/TicketDetailClient.tsx`

**Interfaces:**
- Consumes: `TicketDetail.slaEpisodes`/`statusSlaSaatIni` (Task 3), `POST /sla-eksternal/stop`/`start` (Task 4)
- Produces: —

- [ ] **Step 1: Tambah state modal stop/start**

Baris 294-302 saat ini:
```ts
  // --- Modal close, reopen & delete ---
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeWaktu, setCloseWaktu] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");
```
Ganti jadi:
```ts
  // --- Modal close, reopen & delete ---
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeWaktu, setCloseWaktu] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");

  // --- Modal stop/start SLA Eksternal ---
  const [stopSlaOpen, setStopSlaOpen] = useState(false);
  const [stopSlaBusy, setStopSlaBusy] = useState(false);
  const [stopSlaCatatan, setStopSlaCatatan] = useState("");
  const [startSlaOpen, setStartSlaOpen] = useState(false);
  const [startSlaBusy, setStartSlaBusy] = useState(false);
```

- [ ] **Step 2: Tambah handler `confirmStopSla`/`confirmStartSla`**

Persis setelah fungsi `confirmReopen` (baris 453-472, sebelum `async function confirmDelete()`):

```ts
  async function confirmStopSla() {
    setActionErr("");
    setStopSlaBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/sla-eksternal/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catatan: stopSlaCatatan || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionErr(data.error ?? "Gagal menghentikan SLA Eksternal.");
        return;
      }
      setStopSlaOpen(false);
      setStopSlaCatatan("");
      await reload();
    } finally {
      setStopSlaBusy(false);
    }
  }

  async function confirmStartSla() {
    setActionErr("");
    setStartSlaBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/sla-eksternal/start`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionErr(data.error ?? "Gagal melanjutkan SLA Eksternal.");
        return;
      }
      setStartSlaOpen(false);
      await reload();
    } finally {
      setStartSlaBusy(false);
    }
  }
```

- [ ] **Step 3: Tambah badge status + tombol + riwayat di Card "Detail Gangguan"**

Baris 631-639 saat ini:
```tsx
              <Field label="No Tiket Vendor" value={ticket.noTiketVendor} />
              <Field
                label="Waktu Lapor ke Vendor"
                value={
                  ticket.waktuLaporVendor ? fmtDateTime(ticket.waktuLaporVendor) : null
                }
              />
              <Field label="Keterangan" value={ticket.keterangan} />
            </dl>
          </Card>
```
Ganti jadi:
```tsx
              <Field label="No Tiket Vendor" value={ticket.noTiketVendor} />
              <Field
                label="Waktu Lapor ke Vendor"
                value={
                  ticket.waktuLaporVendor ? fmtDateTime(ticket.waktuLaporVendor) : null
                }
              />
              <Field label="Keterangan" value={ticket.keterangan} />
            </dl>

            {ticket.statusSlaSaatIni && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant={
                      ticket.statusSlaSaatIni === "eksternal" ? "success" : "warning"
                    }
                  >
                    {ticket.statusSlaSaatIni === "eksternal"
                      ? "SLA Eksternal — Berjalan"
                      : "SLA Internal — Dihentikan Sementara"}
                  </Badge>
                  {canMutate &&
                    !isSelesai &&
                    (ticket.statusSlaSaatIni === "eksternal" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setActionErr("");
                          setStopSlaOpen(true);
                        }}
                      >
                        Stop SLA Eksternal
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setActionErr("");
                          setStartSlaOpen(true);
                        }}
                      >
                        Start SLA Eksternal
                      </Button>
                    ))}
                </div>
                {ticket.slaEpisodes.length > 0 && (
                  <ul className="text-xs text-gray-500 space-y-1">
                    {ticket.slaEpisodes.map((e) => (
                      <li key={e.id}>
                        {e.basis === "internal" ? "Internal" : "Eksternal"} sejak{" "}
                        {fmtDateTime(e.mulai)} — {e.dibuatOlehNama}
                        {e.catatan ? ` (${e.catatan})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
```

- [ ] **Step 4: Tambah modal stop & start**

Persis setelah `{/* ---- Modal buka kembali (reopen) ---- */}` ... `</Modal>` (baris 1230-1266), sebelum `{/* ---- Modal hapus ---- */}`:

```tsx
      {/* ---- Modal stop SLA Eksternal ---- */}
      <Modal
        open={stopSlaOpen}
        onClose={() => setStopSlaOpen(false)}
        title="Hentikan Sementara SLA Eksternal?"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Hitungan SLA akan kembali ke <span className="font-semibold">Internal</span> mulai
          sekarang (mis. karena PIC vendor tidak bisa dihubungi/eksekusi). Bisa
          dilanjutkan lagi kapan pun lewat tombol &ldquo;Start SLA
          Eksternal&rdquo;.
        </p>
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Catatan (opsional)
          </label>
          <textarea
            rows={2}
            value={stopSlaCatatan}
            onChange={(e) => setStopSlaCatatan(e.target.value)}
            placeholder="mis. PIC vendor tidak bisa dihubungi…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        {actionErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {actionErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setStopSlaOpen(false)}>
            Batal
          </Button>
          <Button loading={stopSlaBusy} onClick={confirmStopSla}>
            Ya, Hentikan Sementara
          </Button>
        </div>
      </Modal>

      {/* ---- Modal start (lanjutkan) SLA Eksternal ---- */}
      <Modal
        open={startSlaOpen}
        onClose={() => setStartSlaOpen(false)}
        title="Lanjutkan SLA Eksternal?"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Hitungan SLA akan kembali ke <span className="font-semibold">Eksternal</span>{" "}
          mulai sekarang, memakai No Tiket Vendor yang sama seperti sebelumnya.
        </p>
        {actionErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {actionErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setStartSlaOpen(false)}>
            Batal
          </Button>
          <Button loading={startSlaBusy} onClick={confirmStartSla}>
            Ya, Lanjutkan
          </Button>
        </div>
      </Modal>

```

- [ ] **Step 5: `tsc --noEmit`**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-task5.log 2>&1; echo "exit=$?"; tail -30 /tmp/tsc-task5.log
```

Expected: `exit=0`.

- [ ] **Step 6: `eslint`**

```bash
./node_modules/.bin/eslint components/daily-monitoring/TicketDetailClient.tsx > /tmp/eslint-task5.log 2>&1; echo "exit=$?"; cat /tmp/eslint-task5.log
```

Expected: `exit=0`, tidak ada warning/error.

- [ ] **Step 7: Commit**

```bash
git add components/daily-monitoring/TicketDetailClient.tsx
git commit -m "feat(sla): UI stop/start SLA Eksternal di Detail Tiket (badge, tombol, riwayat)"
```

---

### Task 6: Verifikasi end-to-end

**Files:** — (tidak ada perubahan kode; checklist manual)

**Interfaces:**
- Consumes: seluruh Task 1-5
- Produces: —

- [ ] **Step 1: Suite penuh**

```bash
./node_modules/.bin/vitest run > /tmp/vitest-final.log 2>&1; echo "exit=$?"; tail -40 /tmp/vitest-final.log
```

Expected: `exit=0`, semua test lulus (termasuk test lama yang tidak disentuh). CATATAN: repo ini punya bug pra-existing tak terkait (`server-only` package hilang, dipakai `lib/notifications.ts`) yang membuat `app/api/tickets/__tests__/createTicketWaktuLaporVendor.test.ts` gagal sejak sebelum plan ini — kalau muncul lagi, itu BUKAN regresi dari plan ini (sudah dilaporkan sebelumnya), tapi laporkan tetap supaya user tahu statusnya.

- [ ] **Step 2: Typecheck & lint penuh**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc-final.log 2>&1; echo "exit=$?"; tail -40 /tmp/tsc-final.log
./node_modules/.bin/eslint lib/ app/api/tickets/ components/daily-monitoring/ > /tmp/eslint-final.log 2>&1; echo "exit=$?"; cat /tmp/eslint-final.log
```

Expected: kedua `exit=0`.

- [ ] **Step 3: Test manual DB & UI — siklus stop/start penuh**

1. Jalankan `./node_modules/.bin/next dev`, login sebagai petugas.
2. Buka/pilih tiket "Proses" yang `noTiketVendor` & `waktuLaporVendor` sudah terisi. Pastikan badge "SLA Eksternal — Berjalan" tampil + tombol "Stop SLA Eksternal".
3. Klik Stop, isi catatan, konfirmasi → badge berubah "SLA Internal — Dihentikan Sementara", tombol berubah jadi "Start SLA Eksternal", riwayat bertambah 1 baris.
4. Klik Start, konfirmasi → badge balik "SLA Eksternal — Berjalan", riwayat bertambah 1 baris lagi.
5. Ulangi stop→start sekali lagi (buktikan BERKALI-KALI benar-benar jalan, bukan cuma sekali).
6. Cek di Database Studio / psql: `SELECT basis, mulai, catatan FROM ticket_sla_episodes WHERE ticket_id = '<id>' ORDER BY mulai;` — pastikan basis berselang-seling (internal, eksternal, internal, eksternal, ...), tidak ada 2 baris `basis` sama berturutan.
7. Buka Monitoring SLA (dashboard), toggle Internal/Eksternal, cek ATM tiket tsb — pastikan downtime kedua basis masuk akal (durasi total = jumlah semua segmen, tidak ada menit yang hilang/dobel).
8. Coba klik Stop 2x cepat berturut-turut (via devtools Network throttle atau klik ganda) — pastikan request kedua dapat error "SLA sudah dalam status Internal.", BUKAN membuat 2 baris episode `internal` berturutan.
9. Tutup tiket itu (Close) selagi status SLA-nya "Internal (dihentikan)" tanpa di-start lagi — pastikan tiket tetap bisa ditutup normal, dan setelah selesai, badge/tombol stop-start otomatis hilang (fitur cuma untuk tiket Proses).

- [ ] **Step 4: Redeploy VM (kalau relevan sekarang)**

Migration harus dijalankan manual di VM produksi — image standalone tidak bawa CLI prisma. Build ulang `--target builder`, jalankan `prisma migrate deploy` lewat `--network container:mtr_app`, baru restart container app (lihat catatan proyek "VM deploy & migration").
