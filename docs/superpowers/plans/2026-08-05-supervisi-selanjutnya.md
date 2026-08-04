# Supervisi Selanjutnya (Shift C & E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menampilkan blok tanda tangan "Supervisi Selanjutnya" (kolom `L`) di laporan harian shift C & E, mewajibkan approval dari supervisi tersebut, dan mengirimi dia notifikasi Telegram berisi daftar tiket lanjutan.

**Architecture:** Seluruh aturan approval ganda dikumpulkan di satu modul murni tanpa Prisma (`lib/shiftReportApproval.ts`) agar bisa di-unit-test tanpa database — pola yang sama dengan `lib/reportSignatures.ts`. Modul itu dipakai berurutan oleh lapisan tanda tangan (`lib/shiftReport.ts` → `lib/excelReport.ts` → `lib/reportData.ts`), lapisan API (routes handover/close/approve), lapisan query (`lib/shiftReportQueries.ts`), UI, dan Telegram. Skema hanya bertambah 3 kolom nullable — migrasi additive, tanpa backfill.

**Tech Stack:** Next.js 15.5 (App Router) · Prisma 6.19 + PostgreSQL · ExcelJS 4.4 · Vitest 4.1 · TypeScript 5 · Tailwind 3.4

**Spec:** [`docs/superpowers/specs/2026-08-05-supervisi-selanjutnya-design.md`](../specs/2026-08-05-supervisi-selanjutnya-design.md)

## Global Constraints

- **Ruang lingkup laporan: HARIAN saja** (`lib/excelReport.ts`). `lib/excelReportLengkap.ts`, `lib/weeklyReport.ts`, `lib/logbookExcel.ts` TIDAK disentuh.
- **Pakai binary lokal, BUKAN `npx`** (hook RTK dapat merusak `npx`): `./node_modules/.bin/prisma`, `./node_modules/.bin/tsc`, `./node_modules/.bin/vitest`, `./node_modules/.bin/next`.
- **File besar diverifikasi lewat `python3`**, dan output `tsc`/`eslint` di-redirect ke file — output RTK memampatkan/mengubah tampilan file kode besar (`lib/excelReport.ts` 852 baris, `components/daily-monitoring/DailyMonitoringClient.tsx` 749 baris).
- **Shift yang punya blok "Supervisi Selanjutnya": `C` dan `E` saja.** Nilainya di shift A/B/D DIPAKSA `null` di server.
- **Supervisi utama BOLEH sama dengan supervisi selanjutnya.** Jangan tambahkan validasi yang melarangnya (dibuktikan sheet manual `01-08-2026 19-07` di `Laporan Juli.xlsx`: `I27` == `L27` == "Dimas Teguh"). Satu klik approve menuntaskan dua peran.
- **Komentar kode berbahasa Indonesia**, mengikuti konvensi repo ini.
- **Bahasa UI Indonesia**, mengikuti label yang sudah ada.
- Nama kolom DB memakai `@map` snake_case, field Prisma camelCase — konvensi `prisma/schema.prisma` yang berlaku.
- Jalankan `./node_modules/.bin/vitest run` dan `./node_modules/.bin/tsc --noEmit` sebelum tiap commit; laporkan hasilnya.

---

### Task 1: Skema Prisma — kolom approval supervisi selanjutnya

**Files:**
- Modify: `prisma/schema.prisma:106-108` (relasi `User`), `prisma/schema.prisma:292-323` (`model ShiftReport`)
- Create: `prisma/migrations/<timestamp>_supervisi_next_approval/migration.sql` (dihasilkan Prisma)

**Interfaces:**
- Consumes: —
- Produces: field `ShiftReport.supervisiNextApprovedAt: DateTime | null`, `ShiftReport.supervisiNextApprovedById: string | null`, `ShiftReport.catatanSupervisiNext: string | null`, relasi `supervisiNextApprover`. Dipakai Task 3, 6, 7, 8, 10.

- [ ] **Step 1: Tambah 3 kolom + relasi di `model ShiftReport`**

Di `prisma/schema.prisma`, sisipkan setelah baris `catatanSupervisi String? @map("catatan_supervisi")` (baris 306):

```prisma
  // Approval kedua untuk laporan shift malam (C/E) — supervisi yang meneruskan
  // pemantauan tiket lanjutan. Nullable: shift A/B/D tidak memakainya.
  supervisiNextApprovedAt   DateTime? @map("supervisi_next_approved_at")
  supervisiNextApprovedById String?   @map("supervisi_next_approved_by")
  catatanSupervisiNext      String?   @map("catatan_supervisi_next")
```

Sisipkan relasi setelah baris `approver User? @relation("ShiftReportApprover", ...)` (baris 315):

```prisma
  supervisiNextApprover User? @relation("ShiftReportSupervisiNextApprover", fields: [supervisiNextApprovedById], references: [id])
```

Sisipkan index setelah `@@index([supervisiId, status])` (baris 321):

```prisma
  @@index([supervisiNextId, status])
```

- [ ] **Step 2: Tambah sisi balik relasi di `model User`**

Setelah baris 108 (`shiftReportsApproved ShiftReport[] @relation("ShiftReportApprover")`):

```prisma
  shiftReportsNextApproved  ShiftReport[] @relation("ShiftReportSupervisiNextApprover")
```

- [ ] **Step 3: Jalankan migrasi**

```bash
./node_modules/.bin/prisma migrate dev --name supervisi_next_approval
```

Expected: migrasi baru terbuat, `prisma generate` jalan otomatis, tidak ada prompt data-loss (semua kolom nullable).

- [ ] **Step 4: Verifikasi tipe Prisma Client ter-generate**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc1.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc1.log
```

Expected: `exit=0` (kolom baru belum dipakai kode mana pun, jadi tidak ada error).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): kolom approval supervisi selanjutnya di shift_reports"
```

---

### Task 2: Modul murni `lib/shiftReportApproval.ts`

**Files:**
- Create: `lib/shiftReportApproval.ts`
- Test: `lib/__tests__/shiftReportApproval.test.ts`

**Interfaces:**
- Consumes: —
- Produces (dipakai Task 3, 5, 6, 7, 8, 9, 10):
  - `SHIFT_SUPERVISI_NEXT: ReadonlySet<string>`
  - `shiftPakaiSupervisiNext(shiftKode: string): boolean`
  - `interface ApprovalRefs { shiftKode: string; supervisiId?: string | null; supervisiNextId?: string | null }`
  - `butuhApprovalSupervisiNext(r: ApprovalRefs): boolean`
  - `type PeranApproval = "utama" | "selanjutnya" | "keduanya" | null`
  - `resolvePeranApproval(r: ApprovalRefs, userId: string): PeranApproval`
  - `interface ApprovalState extends ApprovalRefs { approvedAt?: Date | null; supervisiNextApprovedAt?: Date | null }`
  - `hitungStatusLaporan(r: ApprovalState): "pending" | "approved"`
  - `type LabelApproval = "Menunggu Approval" | "Menunggu Supervisi Utama" | "Menunggu Supervisi Selanjutnya" | "Sudah Diapprove"`
  - `labelApproval(r: ApprovalState): LabelApproval`

**PENTING:** modul ini TIDAK boleh `import "server-only"` dan TIDAK boleh mengimpor Prisma — ia harus bisa di-import dari komponen klien (Task 8, 9) dan diuji tanpa database.

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/__tests__/shiftReportApproval.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  shiftPakaiSupervisiNext,
  butuhApprovalSupervisiNext,
  resolvePeranApproval,
  hitungStatusLaporan,
  labelApproval,
} from "../shiftReportApproval";

const T = new Date("2026-08-05T02:00:00Z");

describe("shiftPakaiSupervisiNext", () => {
  it("true hanya untuk shift malam C & E", () => {
    expect(shiftPakaiSupervisiNext("C")).toBe(true);
    expect(shiftPakaiSupervisiNext("E")).toBe(true);
    expect(shiftPakaiSupervisiNext("A")).toBe(false);
    expect(shiftPakaiSupervisiNext("B")).toBe(false);
    expect(shiftPakaiSupervisiNext("D")).toBe(false);
  });
});

describe("butuhApprovalSupervisiNext", () => {
  it("true untuk shift C yang punya supervisiNextId", () => {
    expect(
      butuhApprovalSupervisiNext({ shiftKode: "C", supervisiNextId: "u2" })
    ).toBe(true);
  });
  it("false untuk shift C tanpa supervisiNextId (data lama)", () => {
    expect(
      butuhApprovalSupervisiNext({ shiftKode: "C", supervisiNextId: null })
    ).toBe(false);
  });
  it("false untuk shift A walau supervisiNextId terisi (data lama)", () => {
    expect(
      butuhApprovalSupervisiNext({ shiftKode: "A", supervisiNextId: "u2" })
    ).toBe(false);
  });
});

describe("resolvePeranApproval", () => {
  const base = { shiftKode: "C", supervisiId: "u1", supervisiNextId: "u2" };
  it("mengenali supervisi utama", () => {
    expect(resolvePeranApproval(base, "u1")).toBe("utama");
  });
  it("mengenali supervisi selanjutnya", () => {
    expect(resolvePeranApproval(base, "u2")).toBe("selanjutnya");
  });
  it("mengembalikan 'keduanya' bila orang yang sama memegang dua peran", () => {
    expect(
      resolvePeranApproval(
        { shiftKode: "E", supervisiId: "u9", supervisiNextId: "u9" },
        "u9"
      )
    ).toBe("keduanya");
  });
  it("null untuk user yang tidak terkait", () => {
    expect(resolvePeranApproval(base, "u3")).toBeNull();
  });
  it("shift A: pemegang supervisiNextId lama TIDAK dapat peran", () => {
    expect(
      resolvePeranApproval(
        { shiftKode: "A", supervisiId: "u1", supervisiNextId: "u2" },
        "u2"
      )
    ).toBeNull();
  });
});

describe("hitungStatusLaporan", () => {
  it("shift A approved begitu supervisi utama approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "A",
        supervisiNextId: null,
        approvedAt: T,
        supervisiNextApprovedAt: null,
      })
    ).toBe("approved");
  });
  it("shift C tetap pending bila baru supervisi utama yang approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: null,
      })
    ).toBe("pending");
  });
  it("shift C tetap pending bila baru supervisi selanjutnya yang approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: null,
        supervisiNextApprovedAt: T,
      })
    ).toBe("pending");
  });
  it("shift C approved setelah keduanya approve", () => {
    expect(
      hitungStatusLaporan({
        shiftKode: "C",
        supervisiNextId: "u2",
        approvedAt: T,
        supervisiNextApprovedAt: T,
      })
    ).toBe("approved");
  });
});

describe("labelApproval", () => {
  const c = { shiftKode: "C", supervisiNextId: "u2" as string | null };
  it("tanpa supervisi selanjutnya: Menunggu Approval → Sudah Diapprove", () => {
    const a = { shiftKode: "A", supervisiNextId: null };
    expect(
      labelApproval({ ...a, approvedAt: null, supervisiNextApprovedAt: null })
    ).toBe("Menunggu Approval");
    expect(
      labelApproval({ ...a, approvedAt: T, supervisiNextApprovedAt: null })
    ).toBe("Sudah Diapprove");
  });
  it("dual-gate: belum ada yang approve", () => {
    expect(
      labelApproval({ ...c, approvedAt: null, supervisiNextApprovedAt: null })
    ).toBe("Menunggu Approval");
  });
  it("dual-gate: utama sudah, selanjutnya belum", () => {
    expect(
      labelApproval({ ...c, approvedAt: T, supervisiNextApprovedAt: null })
    ).toBe("Menunggu Supervisi Selanjutnya");
  });
  it("dual-gate: selanjutnya sudah, utama belum", () => {
    expect(
      labelApproval({ ...c, approvedAt: null, supervisiNextApprovedAt: T })
    ).toBe("Menunggu Supervisi Utama");
  });
  it("dual-gate: keduanya sudah", () => {
    expect(
      labelApproval({ ...c, approvedAt: T, supervisiNextApprovedAt: T })
    ).toBe("Sudah Diapprove");
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan GAGAL**

```bash
./node_modules/.bin/vitest run lib/__tests__/shiftReportApproval.test.ts
```

Expected: FAIL — `Failed to resolve import "../shiftReportApproval"`.

- [ ] **Step 3: Implementasi modul**

Buat `lib/shiftReportApproval.ts`:

```ts
/**
 * Aturan approval GANDA laporan shift malam (spec 2026-08-05).
 *
 * Shift C (23:00–07:00) & E (19:00–07:00) melewati tengah malam, sehingga tiket
 * yang masih proses diteruskan ke supervisi lain. Lembar manual Form OPS-001
 * untuk kedua shift itu punya blok tanda tangan ke-6 ("Supervisi Selanjutnya",
 * kolom L) yang tidak ada di shift A/B.
 *
 * Modul MURNI: tanpa Prisma dan tanpa "server-only", supaya seluruh aturannya
 * bisa diuji unit tanpa database DAN dipakai dari komponen klien. Pola yang
 * sama dengan lib/reportSignatures.ts.
 */

/** Shift malam yang laporannya punya blok "Supervisi Selanjutnya". */
export const SHIFT_SUPERVISI_NEXT: ReadonlySet<string> = new Set(["C", "E"]);

export function shiftPakaiSupervisiNext(shiftKode: string): boolean {
  return SHIFT_SUPERVISI_NEXT.has(shiftKode);
}

/** Identitas penanda tangan sebuah laporan shift. */
export interface ApprovalRefs {
  shiftKode: string;
  supervisiId?: string | null;
  supervisiNextId?: string | null;
}

/**
 * True bila laporan ini WAJIB di-approve juga oleh supervisi selanjutnya.
 *
 * Sengaja mengecek shiftKode DAN supervisiNextId: dropdown "Supervisi
 * Selanjutnya" dulu tampil di semua shift, jadi laporan lama shift A/B/D bisa
 * saja punya supervisiNextId. Laporan itu tidak boleh mendadak butuh approval
 * kedua dan macet di status pending selamanya.
 */
export function butuhApprovalSupervisiNext(r: ApprovalRefs): boolean {
  return shiftPakaiSupervisiNext(r.shiftKode) && Boolean(r.supervisiNextId);
}

export type PeranApproval = "utama" | "selanjutnya" | "keduanya" | null;

/**
 * Peran seorang user terhadap sebuah laporan. "keduanya" bila orang yang sama
 * dipilih sebagai supervisi utama DAN supervisi selanjutnya — kasus nyata pada
 * lembar manual 01-08-2026 19-07 (I27 == L27). Satu klik approve menuntaskan
 * dua-duanya (lihat route approve).
 */
export function resolvePeranApproval(
  r: ApprovalRefs,
  userId: string
): PeranApproval {
  const utama = Boolean(r.supervisiId) && r.supervisiId === userId;
  const next = butuhApprovalSupervisiNext(r) && r.supervisiNextId === userId;
  if (utama && next) return "keduanya";
  if (utama) return "utama";
  if (next) return "selanjutnya";
  return null;
}

export interface ApprovalState extends ApprovalRefs {
  approvedAt?: Date | null;
  supervisiNextApprovedAt?: Date | null;
}

/** "pending" sampai SEMUA approval yang diwajibkan laporan ini terisi. */
export function hitungStatusLaporan(r: ApprovalState): "pending" | "approved" {
  if (!r.approvedAt) return "pending";
  if (butuhApprovalSupervisiNext(r) && !r.supervisiNextApprovedAt) return "pending";
  return "approved";
}

export type LabelApproval =
  | "Menunggu Approval"
  | "Menunggu Supervisi Utama"
  | "Menunggu Supervisi Selanjutnya"
  | "Sudah Diapprove";

/** Label badge di menu Supervisi & halaman detail laporan. */
export function labelApproval(r: ApprovalState): LabelApproval {
  const utamaOk = Boolean(r.approvedAt);
  const nextOk = Boolean(r.supervisiNextApprovedAt);
  if (!butuhApprovalSupervisiNext(r)) {
    return utamaOk ? "Sudah Diapprove" : "Menunggu Approval";
  }
  if (utamaOk && nextOk) return "Sudah Diapprove";
  if (utamaOk) return "Menunggu Supervisi Selanjutnya";
  if (nextOk) return "Menunggu Supervisi Utama";
  return "Menunggu Approval";
}
```

- [ ] **Step 4: Jalankan test — pastikan LULUS**

```bash
./node_modules/.bin/vitest run lib/__tests__/shiftReportApproval.test.ts
```

Expected: PASS, 18 test.

- [ ] **Step 5: Commit**

```bash
git add lib/shiftReportApproval.ts lib/__tests__/shiftReportApproval.test.ts
git commit -m "feat(lib): modul murni aturan approval ganda supervisi selanjutnya"
```

---

### Task 3: `lib/shiftReport.ts` — blok tanda tangan supervisi selanjutnya

**Files:**
- Modify: `lib/shiftReport.ts:9-29` (interface), `lib/shiftReport.ts:40-56` (implementasi)
- Test: `lib/__tests__/shiftReport.test.ts` (perluas)

**Interfaces:**
- Consumes: `shiftPakaiSupervisiNext` dari Task 2.
- Produces (dipakai Task 4): `ShiftReportSignerInput` bertambah `shiftKode: string`, `supervisiNext?: { nama?: string | null; ttdUrl?: string | null } | null`, `supervisiNextId?: string | null`, `approvedAt?: Date | null`, `supervisiNextApprovedAt?: Date | null`. `ShiftReportSignatures` bertambah `showSupervisiNext: boolean`, `supervisiNext: string`, `supervisiNextApproved: boolean`, `supervisiNextTtdPath: string | null`.

**PERUBAHAN PERILAKU KODE LAMA — baca dulu:** `supervisiApproved` saat ini dihitung dari `status === "approved"` (`lib/shiftReport.ts:41`). Karena `status` mulai Task 6 menjadi dual-gate, ia harus beralih ke `approvedAt != null`. Tanpa perubahan ini, TTD supervisi UTAMA akan menghilang dari laporan shift C/E setiap kali supervisi selanjutnya belum approve — regresi halus. `status` tetap dipertahankan sebagai fallback untuk pemanggil yang tidak mengirim `approvedAt` (cabang fallback `lib/reportData.ts`).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `lib/__tests__/shiftReport.test.ts`, DAN tambahkan `shiftKode: "A" as string,` ke objek `base` yang sudah ada (baris 14-25):

```ts
describe("resolveShiftReportSignatures — supervisi selanjutnya (shift C/E)", () => {
  const baseC = {
    shiftKode: "C",
    ownerUser: { nama: "Owner A", ttdUrl: "/ttd/a.png" },
    receiverUser: { nama: "Recv B", ttdUrl: "/ttd/b.png" },
    supervisi: { nama: "Sup C", ttdUrl: "/ttd/c.png" },
    supervisiNext: { nama: "Sup Next", ttdUrl: "/ttd/next.png" },
    supervisiNextId: "u2",
    pimpinanInfra: { nama: "Infra", tipe: "tetap" as const, namaPjs: null },
    pimpinanDivisi: { nama: "Divisi", tipe: "tetap" as const, namaPjs: null },
    approvedAt: null as Date | null,
    supervisiNextApprovedAt: null as Date | null,
    status: "pending" as const,
  };
  const T = new Date("2026-08-05T02:00:00Z");

  it("menampilkan blok kolom L hanya untuk shift C & E", () => {
    expect(resolveShiftReportSignatures(baseC).showSupervisiNext).toBe(true);
    expect(
      resolveShiftReportSignatures({ ...baseC, shiftKode: "E" }).showSupervisiNext
    ).toBe(true);
    expect(
      resolveShiftReportSignatures({ ...baseC, shiftKode: "A" }).showSupervisiNext
    ).toBe(false);
  });

  it("nama supervisi selanjutnya tampil walau belum approve, TTD-nya null", () => {
    const s = resolveShiftReportSignatures(baseC);
    expect(s.supervisiNext).toBe("Sup Next");
    expect(s.supervisiNextApproved).toBe(false);
    expect(s.supervisiNextTtdPath).toBeNull();
  });

  it("TTD supervisi selanjutnya muncul setelah supervisiNextApprovedAt terisi", () => {
    const s = resolveShiftReportSignatures({
      ...baseC,
      supervisiNextApprovedAt: T,
    });
    expect(s.supervisiNextApproved).toBe(true);
    expect(s.supervisiNextTtdPath).toBe("/ttd/next.png");
  });

  it("REGRESI: TTD supervisi utama tetap tampil saat status masih pending karena menunggu supervisi selanjutnya", () => {
    const s = resolveShiftReportSignatures({
      ...baseC,
      approvedAt: T,
      supervisiNextApprovedAt: null,
      status: "pending",
    });
    expect(s.supervisiApproved).toBe(true);
    expect(s.supervisiTtdPath).toBe("/ttd/c.png");
  });

  it("tanpa approvedAt, gate TTD utama jatuh kembali ke status (data lama)", () => {
    const s = resolveShiftReportSignatures({
      shiftKode: "A",
      ownerUser: { nama: "O", ttdUrl: null },
      supervisi: { nama: "S", ttdUrl: "/ttd/s.png" },
      status: "approved",
    });
    expect(s.supervisiApproved).toBe(true);
    expect(s.supervisiTtdPath).toBe("/ttd/s.png");
  });

  it("blok L kosong (data lama tanpa supervisiNext) tetap ditampilkan", () => {
    const s = resolveShiftReportSignatures({
      ...baseC,
      supervisiNext: null,
      supervisiNextId: null,
    });
    expect(s.showSupervisiNext).toBe(true);
    expect(s.supervisiNext).toBe("");
    expect(s.supervisiNextTtdPath).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan GAGAL**

```bash
./node_modules/.bin/vitest run lib/__tests__/shiftReport.test.ts
```

Expected: FAIL — properti `showSupervisiNext` tidak ada pada tipe hasil.

- [ ] **Step 3: Implementasi**

Ganti isi `lib/shiftReport.ts` mulai baris 9 sampai akhir file dengan:

```ts
export interface ShiftReportSignerInput {
  /** Kode shift laporan — penentu apakah blok kolom L dicetak (C/E saja). */
  shiftKode: string;
  ownerUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  receiverUser?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisi?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisiNext?: { nama?: string | null; ttdUrl?: string | null } | null;
  supervisiNextId?: string | null;
  pimpinanInfra?: LeaderRef | null;
  pimpinanDivisi?: LeaderRef | null;
  /**
   * Waktu approve supervisi UTAMA — gate TTD supervisi utama.
   *
   * Sengaja BUKAN `status`: sejak approval ganda, `status` baru "approved"
   * setelah supervisi selanjutnya ikut approve, sehingga memakainya akan
   * menyembunyikan TTD supervisi utama yang sebenarnya sudah sah.
   */
  approvedAt?: Date | null;
  /** Waktu approve supervisi selanjutnya — gate TTD blok kolom L. */
  supervisiNextApprovedAt?: Date | null;
  /** "pending" | "approved" — fallback bila `approvedAt` tidak dikirim. */
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
  /** True untuk shift C & E → blok TTD kolom L ikut dicetak. */
  showSupervisiNext: boolean;
  supervisiNext: string;
  supervisiNextApproved: boolean;
  supervisiNextTtdPath: string | null;
  pimpinanInfra: string;
  pimpinanDivisi: string;
}

/**
 * Bangun blok tanda tangan laporan dari sebuah ShiftReport (PART 4).
 *
 * - Penyerah = owner shift; Penerima = penerima shift (kosong bila ditutup
 *   tanpa penerima).
 * - Nama supervisi selalu ikut; TTD-nya hanya muncul setelah peran itu approve.
 * - Blok "Supervisi Selanjutnya" (kolom L) hanya untuk shift C & E, dan TETAP
 *   dicetak walau namanya kosong (data lama) supaya bisa ditandatangani manual.
 * - Pimpinan: tanpa TTD; nama mengikuti tipe (PJS → nama_pjs).
 */
export function resolveShiftReportSignatures(
  r: ShiftReportSignerInput
): ShiftReportSignatures {
  const approvedUtama =
    r.approvedAt !== undefined ? r.approvedAt !== null : r.status === "approved";
  const approvedNext = Boolean(r.supervisiNextApprovedAt);
  const showNext = shiftPakaiSupervisiNext(r.shiftKode);
  return {
    penyerah: r.ownerUser?.nama ?? "",
    penyerahTtdPath: r.ownerUser?.ttdUrl ?? null,
    penerima: r.receiverUser?.nama ?? "",
    penerimaTtdPath: r.receiverUser?.ttdUrl ?? null,
    supervisi: r.supervisi?.nama ?? "",
    supervisiApproved: approvedUtama,
    supervisiTtdPath: approvedUtama ? r.supervisi?.ttdUrl ?? null : null,
    showSupervisiNext: showNext,
    supervisiNext: showNext ? r.supervisiNext?.nama ?? "" : "",
    supervisiNextApproved: showNext && approvedNext,
    supervisiNextTtdPath:
      showNext && approvedNext ? r.supervisiNext?.ttdUrl ?? null : null,
    pimpinanInfra: resolveLeaderName(r.pimpinanInfra),
    pimpinanDivisi: resolveLeaderName(r.pimpinanDivisi),
  };
}
```

Tambahkan import di baris 2:

```ts
import { shiftPakaiSupervisiNext } from "@/lib/shiftReportApproval";
```

- [ ] **Step 4: Jalankan test — pastikan LULUS**

```bash
./node_modules/.bin/vitest run lib/__tests__/shiftReport.test.ts
```

Expected: PASS. Test lama (`hides supervisi TTD while pending`, `shows supervisi TTD once approved`) tetap hijau karena `base` tidak mengirim `approvedAt` → jatuh ke fallback `status`.

- [ ] **Step 5: Commit**

```bash
git add lib/shiftReport.ts lib/__tests__/shiftReport.test.ts
git commit -m "feat(lib): blok tanda tangan supervisi selanjutnya untuk shift C/E"
```

---

### Task 4: Blok TTD kolom `L` di Excel + wiring data laporan

**Files:**
- Modify: `lib/excelReport.ts:66-80` (interface `ReportSignatures`), `lib/excelReport.ts:770-845` (array `blocks`, guard merge, titik tengah TTD)
- Modify: `lib/reportData.ts:246-258` (include handover), `lib/reportData.ts:262-278` (include shiftReport), `lib/reportData.ts:293-341` (kedua cabang `signatures`)

**Interfaces:**
- Consumes: `ShiftReportSignatures` (Task 3), `shiftPakaiSupervisiNext` (Task 2).
- Produces: `ReportSignatures` bertambah 4 field (`showSupervisiNext`, `supervisiNext`, `supervisiNextApproved`, `supervisiNextTtdPath`).

Kedua file digarap dalam SATU task karena `ReportSignatures` dipakai `lib/reportData.ts:293` — menambah field wajib di satu file tanpa yang lain membuat `tsc` merah.

Referensi layout dari lembar manual (`Laporan Juli.xlsx`, sheet `31-07-2026 23-07`): header di `L25:L27` (merge 3 baris, **1 kolom**), nama di `L30` (**tidak di-merge**). Blok lain merge 2 kolom (`C25:D27` dst).

- [ ] **Step 1: Tambah 4 field ke `ReportSignatures`**

Di `lib/excelReport.ts`, sisipkan sebelum `pimpinanInfra: string;` (baris 78):

```ts
  /** True untuk shift C & E → blok TTD kolom L "Supervisi Selanjutnya" dicetak. */
  showSupervisiNext: boolean;
  supervisiNext: string;
  /** True bila supervisi selanjutnya sudah approve → TTD-nya boleh muncul. */
  supervisiNextApproved: boolean;
  /** Path TTD digital supervisi selanjutnya relatif /public. */
  supervisiNextTtdPath: string | null;
```

- [ ] **Step 2: Sisipkan blok `L` ke array `blocks`**

Di `lib/excelReport.ts`, ubah komentar baris 770 dan sisipkan entri baru SETELAH baris blok `I:J` (baris 784):

```ts
  // Kolom blok TTD: penyerah C:D, penerima F:G, supervisi I:J, supervisi
  // selanjutnya L (1 kolom, khusus shift C/E), infra O:P, divisi R:S.
```

```ts
    ...(sig.showSupervisiNext
      ? [{ c1: "L", c2: "L", imgCol: 11, title: "Supervisi Selanjutnya", nama: sig.supervisiNext, ttdPath: sig.supervisiNextTtdPath, signer: true, show: sig.supervisiNextApproved }]
      : []),
```

`imgCol: 11` = indeks 0-based kolom L (A=0 … L=11), konsisten dengan C=2, F=5, I=8, O=14, R=17.

- [ ] **Step 3: Guard merge 1 sel pada baris nama**

Di `lib/excelReport.ts`, ganti baris 801:

```ts
    ws.mergeCells(`${b.c1}${nameRow}:${b.c2}${nameRow}`);
```

menjadi:

```ts
    // Blok "Supervisi Selanjutnya" hanya 1 kolom (c1 === c2, mengikuti lembar
    // manual L25:L27 / L30). Merge 1 sel adalah range degenerate — lewati saja,
    // nilainya tetap ditulis. Merge label (L26:L28) tetap valid: 3 baris.
    if (b.c1 !== b.c2) {
      ws.mergeCells(`${b.c1}${nameRow}:${b.c2}${nameRow}`);
    }
```

- [ ] **Step 4: Perbaiki perhitungan titik tengah TTD untuk blok 1 kolom**

Di `lib/excelReport.ts`, ganti baris 827-828:

```ts
        const w1 = colPx(COL_WIDTHS[b.c1]);
        let leftPx = Math.max(0, (w1 + colPx(COL_WIDTHS[b.c2]) - TTD_W) / 2);
```

menjadi:

```ts
        const w1 = colPx(COL_WIDTHS[b.c1]);
        // Blok 1 kolom (c1 === c2) tidak boleh menghitung lebarnya dua kali —
        // TTD-nya akan meleset ke kanan dan meluber ke kolom sebelahnya.
        const w2 = b.c2 === b.c1 ? 0 : colPx(COL_WIDTHS[b.c2]);
        let leftPx = Math.max(0, (w1 + w2 - TTD_W) / 2);
```

`COL_WIDTHS.L = 35.43` → lebar render ≈ 253px; `TTD_W = 130` → TTD terpusat di ≈61px dan tidak menyentuh kolom M.

- [ ] **Step 5: Wiring `lib/reportData.ts` — include relasi**

Tambahkan ke `include` query `handover` (setelah baris 253 `supervisi: {...}`):

```ts
          supervisiNext: { select: { nama: true, ttdUrl: true } },
```

Tambahkan ke `include` query `shiftReport` (setelah baris 273 `supervisi: {...}`):

```ts
          supervisiNext: { select: { nama: true, ttdUrl: true } },
```

Field skalar (`shiftKode`, `supervisiNextId`, `approvedAt`, `supervisiNextApprovedAt`) sudah ikut terbaca karena kedua query memakai `include`, bukan `select`.

- [ ] **Step 6: Wiring `lib/reportData.ts` — cabang ShiftReport**

Sisipkan sebelum `pimpinanInfra: s.pimpinanInfra,` (baris 306):

```ts
      showSupervisiNext: s.showSupervisiNext,
      supervisiNext: s.supervisiNext,
      supervisiNextApproved: s.supervisiNextApproved,
      supervisiNextTtdPath: s.supervisiNextTtdPath,
```

- [ ] **Step 7: Wiring `lib/reportData.ts` — cabang fallback**

Sisipkan sebelum `pimpinanInfra: resolveAcknowledger(` (baris 332):

```ts
      // Data lama tanpa ShiftReport: nama dari handover, TTD selalu null —
      // tanpa record approval tidak ada dasar untuk menempelkan tanda tangan.
      showSupervisiNext: shift ? shiftPakaiSupervisiNext(shift) : false,
      supervisiNext: handover?.supervisiNext?.nama ?? "",
      supervisiNextApproved: false,
      supervisiNextTtdPath: null,
```

Tambahkan import di dekat baris 14:

```ts
import { shiftPakaiSupervisiNext } from "@/lib/shiftReportApproval";
```

- [ ] **Step 8: Verifikasi tipe & test**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc4.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc4.log
./node_modules/.bin/vitest run
```

Expected: `exit=0`, seluruh test PASS.

- [ ] **Step 9: Verifikasi hasil edit pada file besar**

```bash
python3 -c "
ls=open('lib/excelReport.ts',encoding='utf-8').read().split('\n')
for i,l in enumerate(ls):
    if 'Supervisi Selanjutnya' in l or 'b.c2 === b.c1' in l or 'b.c1 !== b.c2' in l:
        print(i+1, l.strip()[:110])
"
```

Expected: 3 baris tercetak (entri blok, guard merge, perbaikan `w2`).

- [ ] **Step 10: Commit**

```bash
git add lib/excelReport.ts lib/reportData.ts
git commit -m "feat(report): blok TTD kolom L supervisi selanjutnya di laporan harian C/E"
```

---

### Task 5: Serah terima & tutup laporan — supervisi selanjutnya wajib untuk C/E

**Files:**
- Modify: `app/api/shift/handover/route.ts:76-80` (sisip validasi), `:120`, `:168` (pakai nilai final)
- Modify: `app/api/shift/close/route.ts:65` (sisip validasi), `:101`, `:131` (pakai nilai final)

**Interfaces:**
- Consumes: `shiftPakaiSupervisiNext` (Task 2).
- Produces: kontrak API — shift C/E menolak request tanpa `supervisiNextId` dengan HTTP 400 dan pesan `"Shift malam (C/E) wajib memilih Supervisi Selanjutnya."`; shift A/B/D selalu menyimpan `supervisiNextId = null`.

Validasi ditempatkan SETELAH `fromShift` divalidasi (handover baris 71-76, close baris 60-65) — bukan di blok parsing body (baris 47/45), karena `fromShift` belum tersedia di sana.

- [ ] **Step 1: Tambah validasi di `app/api/shift/handover/route.ts`**

Sisipkan tepat setelah blok penutup validasi `fromShift` (setelah baris 76, sebelum komentar `// Tanpa argumen 'now': ...`):

```ts
  // Shift malam (C/E) melewati tengah malam → laporannya punya blok tanda
  // tangan "Supervisi Selanjutnya" (Form OPS-001, kolom L). Shift lain tidak
  // punya kolom itu, jadi nilainya DIPAKSA null walau klien mengirimnya —
  // laporan lama shift A/B/D yang terlanjur terisi tidak boleh bertambah.
  const wajibNext = shiftPakaiSupervisiNext(fromShift);
  const supervisiNextFinal = wajibNext ? supervisiNextId : null;
  if (wajibNext && !supervisiNextFinal) {
    return NextResponse.json(
      { error: "Shift malam (C/E) wajib memilih Supervisi Selanjutnya." },
      { status: 400 }
    );
  }
```

Tambahkan import `shiftPakaiSupervisiNext` dari `@/lib/shiftReportApproval` di blok import.

- [ ] **Step 2: Pakai nilai final di kedua `create`**

Ganti `supervisiNextId,` menjadi `supervisiNextId: supervisiNextFinal,` pada:
- `tx.shiftHandover.create` (baris 120)
- `tx.shiftReport.create` (baris 168)

- [ ] **Step 3: Tambah validasi yang sama di `app/api/shift/close/route.ts`**

Sisipkan setelah blok penutup validasi `fromShift` (setelah baris 65), dengan komentar dan kode identik Step 1. Lalu ganti `supervisiNextId,` menjadi `supervisiNextId: supervisiNextFinal,` pada `tx.shiftHandover.create` (baris 101) dan `tx.shiftReport.create` (baris 131). Tambahkan import yang sama.

- [ ] **Step 4: Verifikasi tipe**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc5.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc5.log
```

Expected: `exit=0`.

- [ ] **Step 5: Verifikasi hasil edit**

```bash
grep -n "supervisiNextFinal\|wajibNext" app/api/shift/handover/route.ts app/api/shift/close/route.ts
```

Expected: 4 baris per file (deklarasi `wajibNext`, deklarasi `supervisiNextFinal`, guard `if`, dan 2 pemakaian) — total 10 baris.

- [ ] **Step 6: Commit**

```bash
git add app/api/shift/handover/route.ts app/api/shift/close/route.ts
git commit -m "feat(api): wajibkan supervisi selanjutnya saat serah terima/tutup shift C/E"
```

---

### Task 6: Endpoint approve — dual-gate

**Files:**
- Modify: `app/api/shift-reports/[id]/approve/route.ts:36-66` (ganti pengecekan tunggal + penulisan)

**Interfaces:**
- Consumes: `resolvePeranApproval`, `hitungStatusLaporan` (Task 2); kolom baru (Task 1).
- Produces: kontrak API — 403 bila user bukan salah satu supervisi laporan; 409 bila peran user sudah approve; sukses menulis field sesuai peran lalu menghitung ulang `status`.

- [ ] **Step 1: Ganti blok otorisasi + penulisan**

Di `app/api/shift-reports/[id]/approve/route.ts`, ganti seluruh isi mulai dari `if (report.supervisiId !== session.sub) {` (baris 44) sampai `});` penutup `prisma.shiftReport.update` (baris 66) dengan:

```ts
  const peran = resolvePeranApproval(report, session.sub);
  if (!peran) {
    return NextResponse.json(
      { error: "Laporan ini bukan tanggung jawab supervisi Anda." },
      { status: 403 }
    );
  }

  const utamaSudah = report.approvedAt !== null;
  const nextSudah = report.supervisiNextApprovedAt !== null;
  const perluUtama = peran === "utama" || peran === "keduanya";
  const perluNext = peran === "selanjutnya" || peran === "keduanya";

  // Konflik dihitung PER PERAN, bukan per laporan: pada shift C/E laporan yang
  // sudah di-approve supervisi utama masih menunggu supervisi selanjutnya.
  if ((!perluUtama || utamaSudah) && (!perluNext || nextSudah)) {
    return NextResponse.json(
      { error: "Anda sudah menyetujui laporan shift ini." },
      { status: 409 }
    );
  }

  const now = new Date();
  const patch: Record<string, unknown> = {};
  if (perluUtama && !utamaSudah) {
    patch.approvedAt = now;
    patch.approvedById = session.sub;
    patch.catatanSupervisi = catatan;
  }
  if (perluNext && !nextSudah) {
    patch.supervisiNextApprovedAt = now;
    patch.supervisiNextApprovedById = session.sub;
    patch.catatanSupervisiNext = catatan;
  }

  // Status dihitung dari nilai BARU (bukan nilai lama hasil findUnique) supaya
  // approve terakhir langsung menutup laporan dalam satu update.
  patch.status = hitungStatusLaporan({
    shiftKode: report.shiftKode,
    supervisiNextId: report.supervisiNextId,
    approvedAt: (patch.approvedAt as Date | undefined) ?? report.approvedAt,
    supervisiNextApprovedAt:
      (patch.supervisiNextApprovedAt as Date | undefined) ??
      report.supervisiNextApprovedAt,
  });

  await prisma.shiftReport.update({ where: { id }, data: patch });

  return NextResponse.json({ ok: true, peran, status: patch.status });
```

Rentang yang diganti sudah mencakup blok `if (report.status === "approved") { ... 409 ... }` lama (baris 50-55) — konflik kini dihitung PER PERAN, jadi blok itu memang hilang. Setelah edit, pastikan tidak ada sisa `report.status === "approved"` di file ini (diverifikasi di Step 3).

Tambahkan import:

```ts
import {
  resolvePeranApproval,
  hitungStatusLaporan,
} from "@/lib/shiftReportApproval";
```

- [ ] **Step 2: Verifikasi tipe**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc6.log 2>&1; echo "exit=$?"; tail -20 /tmp/tsc6.log
```

Expected: `exit=0`.

- [ ] **Step 3: Verifikasi tidak ada sisa pengecekan lama**

```bash
grep -n "report.supervisiId !== session.sub\|report.status === \"approved\"" "app/api/shift-reports/[id]/approve/route.ts"
```

Expected: tidak ada hasil.

- [ ] **Step 4: Commit**

```bash
git add "app/api/shift-reports/[id]/approve/route.ts"
git commit -m "feat(api): approve laporan shift dual-gate (supervisi utama + selanjutnya)"
```

---

### Task 7: Query & hak akses menu Supervisi

**Files:**
- Modify: `lib/shiftReportQueries.ts` (filter, list item, detail, helper tiket lanjutan)
- Modify: `app/(app)/supervisi/page.tsx:14-17`, `app/(app)/supervisi/[id]/page.tsx:17-30`, `app/api/shift-reports/route.ts:27-33`

**Interfaces:**
- Consumes: `resolvePeranApproval`, `labelApproval`, `butuhApprovalSupervisiNext`, `PeranApproval`, `LabelApproval` (Task 2).
- Produces (dipakai Task 8 & 10):
  - `ShiftReportListFilter` bertambah `viewerId?: string | null`
  - `ShiftReportListItem` bertambah `supervisiNama: string | null`, `supervisiNextNama: string | null`, `approvedAt: Date | null`, `supervisiNextApprovedAt: Date | null`, `peran: PeranApproval`, `label: LabelApproval`, `jmlTiketLanjutan: number`
  - `ShiftReportDetail` bertambah `supervisiNextId: string | null`, `supervisiNextNama: string | null`, `supervisiNextApproverNama: string | null`, `supervisiNextApprovedAt: Date | null`, `catatanSupervisiNext: string | null`, `label: LabelApproval`
  - `ShiftReportDetailTicket` bertambah `isLanjutan: boolean`
  - `interface TiketLanjutanItem { noTiket: string; kodeAtm: string; namaAtm: string }`
  - `listTiketLanjutan(shiftKode: ShiftKode, tanggal: Date): Promise<TiketLanjutanItem[]>`
  - `countTiketLanjutan(shiftKode: ShiftKode, tanggal: Date): Promise<number>`

**Definisi tiket lanjutan (presisi — JANGAN pakai `status === "proses"`):** tiket yang punya `TicketActivity` dengan `isTindakLanjutFlag = true` **dan** `shiftKode = report.shiftKode`. Penanda itulah yang ditulis handover/close untuk tiket yang masih terbuka saat shift ditutup (`app/api/shift/handover/route.ts:138-146`, `app/api/shift/close/route.ts:112-120`). Memakai `status` akan salah: tiket bisa sudah selesai di shift berikutnya tetapi tetap merupakan lanjutan dari shift ini.

- [ ] **Step 1: Tambah helper tiket lanjutan**

Di `lib/shiftReportQueries.ts`, sisipkan setelah `countTicketsForShiftDay` (setelah baris 42):

```ts
/** Satu tiket lanjutan untuk notif & badge (bentuk ringkas). */
export interface TiketLanjutanItem {
  noTiket: string;
  kodeAtm: string;
  namaAtm: string;
}

/**
 * Tiket shift ini yang ditandai diteruskan ke shift berikutnya.
 *
 * Kriterianya penanda aktivitas `isTindakLanjutFlag` pada shift yang SAMA —
 * bukan `status`, karena tiket bisa selesai di shift berikutnya namun tetap
 * merupakan lanjutan dari shift ini.
 */
export async function listTiketLanjutan(
  shiftKode: ShiftKode,
  tanggal: Date
): Promise<TiketLanjutanItem[]> {
  const { start, end } = wibDayRange(tanggal);
  const rows = await prisma.ticket.findMany({
    where: {
      openShiftKode: shiftKode,
      waktuOpen: { gte: start, lt: end },
      activities: { some: { isTindakLanjutFlag: true, shiftKode } },
    },
    orderBy: { waktuOpen: "asc" },
    include: { atm: { select: { kodeAtm: true, namaAtm: true } } },
  });
  return rows.map((t) => ({
    noTiket: t.noTiket,
    kodeAtm: t.atm?.kodeAtm ?? "—",
    namaAtm: t.atm?.namaAtm ?? "—",
  }));
}

/** Jumlah tiket lanjutan — kriteria sama dengan {@link listTiketLanjutan}. */
export async function countTiketLanjutan(
  shiftKode: ShiftKode,
  tanggal: Date
): Promise<number> {
  const { start, end } = wibDayRange(tanggal);
  return prisma.ticket.count({
    where: {
      openShiftKode: shiftKode,
      waktuOpen: { gte: start, lt: end },
      activities: { some: { isTindakLanjutFlag: true, shiftKode } },
    },
  });
}
```

- [ ] **Step 2: Perluas filter & scoping `listShiftReports`**

Tambahkan ke `ShiftReportListFilter` (setelah baris `supervisiId?: string | null;`):

```ts
  /**
   * Id user yang MELIHAT daftar — hanya untuk menghitung `peran` tiap baris.
   * Sengaja terpisah dari `supervisiId` yang mengatur SCOPING: superadmin
   * mengirim supervisiId null + viewerId sesi, sehingga ia melihat semua
   * laporan dengan peran null (tombol approve nonaktif).
   */
  viewerId?: string | null;
```

Ganti blok scoping (`if (f.supervisiId) where.supervisiId = f.supervisiId;`) dengan:

```ts
  if (f.supervisiId) {
    // Supervisi selanjutnya juga berhak melihat laporan shift malam yang
    // tiket lanjutannya menjadi tanggung jawab pemantauannya.
    where.OR = [
      { supervisiId: f.supervisiId },
      {
        supervisiNextId: f.supervisiId,
        shiftKode: { in: [ShiftKode.C, ShiftKode.E] },
      },
    ];
  }
```

- [ ] **Step 3: Perluas `ShiftReportListItem` + hasil map**

Tambahkan ke interface:

```ts
  supervisiNama: string | null;
  supervisiNextNama: string | null;
  approvedAt: Date | null;
  supervisiNextApprovedAt: Date | null;
  /** Peran viewer atas laporan ini — penentu tombol approve. */
  peran: PeranApproval;
  /** Label badge status gabungan (dual-gate). */
  label: LabelApproval;
  /** Jumlah tiket yang diteruskan ke shift berikutnya. */
  jmlTiketLanjutan: number;
```

Tambahkan ke `include` `findMany`:

```ts
      supervisi: { select: { nama: true } },
      supervisiNext: { select: { nama: true } },
```

Tambahkan ke objek hasil `rows.map`:

```ts
      supervisiNama: r.supervisi?.nama ?? null,
      supervisiNextNama: r.supervisiNext?.nama ?? null,
      approvedAt: r.approvedAt,
      supervisiNextApprovedAt: r.supervisiNextApprovedAt,
      peran: f.viewerId ? resolvePeranApproval(r, f.viewerId) : null,
      label: labelApproval(r),
      jmlTiketLanjutan: butuhApprovalSupervisiNext(r)
        ? await countTiketLanjutan(r.shiftKode, r.tanggal)
        : 0,
```

Query hitung hanya dijalankan untuk laporan yang memang punya supervisi selanjutnya — shift A/B/D melewatinya tanpa query tambahan.

- [ ] **Step 4: Perluas `getShiftReportDetail`**

Tambahkan ke `ShiftReportDetailTicket`:

```ts
  /** True bila tiket ini diteruskan ke shift berikutnya. */
  isLanjutan: boolean;
```

Tambahkan ke `ShiftReportDetail`:

```ts
  supervisiNextId: string | null;
  supervisiNextNama: string | null;
  supervisiNextApproverNama: string | null;
  supervisiNextApprovedAt: Date | null;
  catatanSupervisiNext: string | null;
  label: LabelApproval;
```

Tambahkan ke `include` `findUnique`:

```ts
      supervisiNext: { select: { nama: true } },
      supervisiNextApprover: { select: { nama: true } },
```

Ganti `include` query tiket menjadi:

```ts
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      activities: {
        where: { isTindakLanjutFlag: true, shiftKode: r.shiftKode },
        select: { id: true },
        take: 1,
      },
    },
```

Tambahkan ke objek kembalian:

```ts
    supervisiNextId: r.supervisiNextId,
    supervisiNextNama: r.supervisiNext?.nama ?? null,
    supervisiNextApproverNama: r.supervisiNextApprover?.nama ?? null,
    supervisiNextApprovedAt: r.supervisiNextApprovedAt,
    catatanSupervisiNext: r.catatanSupervisiNext,
    label: labelApproval(r),
```

dan ke tiap item `tickets.map`:

```ts
      isLanjutan: t.activities.length > 0,
```

Tambahkan import di bagian atas file:

```ts
import {
  butuhApprovalSupervisiNext,
  labelApproval,
  resolvePeranApproval,
  type LabelApproval,
  type PeranApproval,
} from "@/lib/shiftReportApproval";
```

- [ ] **Step 5: Teruskan `viewerId` dari ketiga pemanggil**

`app/(app)/supervisi/page.tsx` — ganti panggilan `listShiftReports`:

```ts
  const items = await listShiftReports({
    supervisiId: session.role === "supervisi" ? session.sub : null,
    viewerId: session.sub,
  });
```

`app/api/shift-reports/route.ts` — tambahkan `viewerId: session.sub,` ke objek argumen `listShiftReports`.

- [ ] **Step 6: Perluas gate akses halaman detail**

Di `app/(app)/supervisi/[id]/page.tsx`, ganti blok baris 21-30 dengan:

```ts
  // Supervisi hanya boleh membuka laporan yang terikat ke dirinya — sebagai
  // supervisi utama ATAU supervisi selanjutnya (shift malam). Superadmin
  // (override/emergency) boleh membuka semua tetapi tidak meng-approve.
  const peran = resolvePeranApproval(
    {
      shiftKode: report.shiftKode,
      supervisiId: report.supervisiId,
      supervisiNextId: report.supervisiNextId,
    },
    session.sub
  );
  if (session.role === "supervisi" && !peran) {
    redirect("/supervisi");
  }

  return (
    <ShiftReportDetailClient
      report={report}
      peran={session.role === "supervisi" ? peran : null}
    />
  );
```

Tambahkan import `resolvePeranApproval` dari `@/lib/shiftReportApproval`.

`tsc` akan merah pada prop `peran` sampai Task 8 selesai — itu diharapkan; jalankan verifikasi tipe di akhir Task 8.

- [ ] **Step 7: Verifikasi query (tanpa `tsc` penuh)**

```bash
grep -n "listTiketLanjutan\|countTiketLanjutan\|isLanjutan\|viewerId\|where.OR" lib/shiftReportQueries.ts | head -20
```

Expected: seluruh helper & field baru muncul.

- [ ] **Step 8: Commit**

```bash
git add lib/shiftReportQueries.ts "app/(app)/supervisi/page.tsx" "app/(app)/supervisi/[id]/page.tsx" app/api/shift-reports/route.ts
git commit -m "feat(supervisi): scoping & data tiket lanjutan untuk supervisi selanjutnya"
```

---

### Task 8: UI menu Supervisi — daftar & detail

**Files:**
- Modify: `components/supervisi/ShiftReportListClient.tsx:61`, `:104-155`
- Modify: `components/supervisi/ShiftReportDetailClient.tsx:32-45`, `:76-107`, `:126-140`, `:143-175`, `:215-243`

**Interfaces:**
- Consumes: `ShiftReportListItem`, `ShiftReportDetail`, `ShiftReportDetailTicket` (Task 7); `PeranApproval` (Task 2).
- Produces: prop `ShiftReportDetailClient` berubah dari `{ report, canApprove: boolean }` menjadi `{ report, peran: PeranApproval }`.

- [ ] **Step 1: Daftar — hitung pending per peran**

Di `ShiftReportListClient.tsx`, ganti baris 61:

```ts
  // "Menunggu" dihitung dari sudut pandang viewer: laporan yang PERAN-nya
  // belum approve — bukan sekadar status laporan yang belum lengkap.
  const pendingCount = items.filter((r) =>
    r.peran === "selanjutnya"
      ? !r.supervisiNextApprovedAt
      : r.peran === "keduanya"
        ? !r.approvedAt || !r.supervisiNextApprovedAt
        : !r.approvedAt
  ).length;
```

- [ ] **Step 2: Daftar — kolom Peran + badge status dual-gate**

Tambahkan `<Th>Peran</Th>` setelah `<Th>Penerima</Th>` (baris 110), dan ubah `colSpan={7}` (baris 119) menjadi `colSpan={8}`.

Sisipkan sel baru setelah sel Penerima (setelah baris 133):

```tsx
                <Td className="whitespace-nowrap text-xs">
                  {r.peran === "keduanya" ? (
                    <Badge variant="primary">Utama + Selanjutnya</Badge>
                  ) : r.peran === "selanjutnya" ? (
                    <Badge variant="info">Supervisi Selanjutnya</Badge>
                  ) : r.peran === "utama" ? (
                    <Badge variant="neutral">Supervisi</Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  {r.jmlTiketLanjutan > 0 && (
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {r.jmlTiketLanjutan} tiket lanjutan
                    </div>
                  )}
                </Td>
```

Ganti sel Status (baris 135-143) dengan:

```tsx
                <Td>
                  {r.label === "Sudah Diapprove" ? (
                    <Badge variant="success">
                      <ShieldCheck className="w-3 h-3 mr-0.5" /> {r.label}
                    </Badge>
                  ) : r.label === "Menunggu Approval" ? (
                    <Badge variant="warning">{r.label}</Badge>
                  ) : (
                    <Badge variant="info">{r.label}</Badge>
                  )}
                </Td>
```

Ganti `variant={r.status === "approved" ? "secondary" : "primary"}` (baris 147) menjadi `variant={r.label === "Sudah Diapprove" ? "secondary" : "primary"}`.

- [ ] **Step 3: Detail — ganti prop & hitung state peran**

Di `ShiftReportDetailClient.tsx`, ganti blok `interface Props` (baris 32-35) dan awal fungsi (baris 37-43) dengan:

```tsx
interface Props {
  report: ShiftReportDetail;
  /** Peran viewer; null = tidak berhak approve (mis. superadmin). */
  peran: PeranApproval;
}

export function ShiftReportDetailClient({ report, peran }: Props) {
  const router = useRouter();
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const approved = report.label === "Sudah Diapprove";
  const utamaSudah = Boolean(report.approvedAt);
  const nextSudah = Boolean(report.supervisiNextApprovedAt);
  // Tombol approve muncul selama masih ada peran viewer yang belum approve.
  const bisaApprove =
    peran === "keduanya"
      ? !utamaSudah || !nextSudah
      : peran === "selanjutnya"
        ? !nextSudah
        : peran === "utama"
          ? !utamaSudah
          : false;
  const labelTombol =
    peran === "keduanya"
      ? "Setujui (Supervisi & Supervisi Selanjutnya)"
      : peran === "selanjutnya"
        ? "Setujui sebagai Supervisi Selanjutnya"
        : "Setujui sebagai Supervisi";
```

Tambahkan import tipe:

```ts
import type { PeranApproval } from "@/lib/shiftReportApproval";
```

- [ ] **Step 4: Detail — badge status & info supervisi**

Ganti blok badge (baris 76-82) dengan:

```tsx
          {approved ? (
            <Badge variant="success">
              <ShieldCheck className="w-3 h-3 mr-0.5" /> {report.label}
            </Badge>
          ) : report.label === "Menunggu Approval" ? (
            <Badge variant="warning">{report.label}</Badge>
          ) : (
            <Badge variant="info">{report.label}</Badge>
          )}
```

Sisipkan setelah `InfoRow label="Penerima"` (baris 96):

```tsx
          <InfoRow
            label="Supervisi"
            value={
              (report.supervisiNama ?? "—") +
              (report.approvedAt ? " · sudah approve" : " · menunggu")
            }
          />
          {report.supervisiNextId && (
            <InfoRow
              label="Supervisi Selanjutnya"
              value={
                (report.supervisiNextNama ?? "—") +
                (report.supervisiNextApprovedAt
                  ? " · sudah approve"
                  : " · menunggu")
              }
            />
          )}
```

Ganti blok `{approved && (...)}` (baris 100-106) dengan:

```tsx
        {report.approvedAt && (
          <p className="mt-3 text-xs text-emerald-700">
            Supervisi: disetujui oleh {report.approverNama ?? "—"} ·{" "}
            {fmtDateTime(report.approvedAt)}
            {report.catatanSupervisi ? ` · Catatan: ${report.catatanSupervisi}` : ""}
          </p>
        )}
        {report.supervisiNextApprovedAt && (
          <p className="mt-1 text-xs text-emerald-700">
            Supervisi Selanjutnya: disetujui oleh{" "}
            {report.supervisiNextApproverNama ?? "—"} ·{" "}
            {fmtDateTime(report.supervisiNextApprovedAt)}
            {report.catatanSupervisiNext
              ? ` · Catatan: ${report.catatanSupervisiNext}`
              : ""}
          </p>
        )}
```

- [ ] **Step 5: Detail — penjelas peran + urutan & badge tiket lanjutan**

Sisipkan tepat sebelum `{/* Daftar tiket shift ini */}` (sebelum baris 109):

```tsx
      {(peran === "selanjutnya" || peran === "keduanya") && (
        <p className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-800">
          Tiket bertanda <b>Lanjutan</b> di bawah adalah tindak lanjut dari shift
          ini yang menjadi tanggung jawab pemantauan Anda.
        </p>
      )}
```

Ganti `{report.tickets.map((t) => (` (baris 135) dengan versi terurut — tiket lanjutan di atas:

```tsx
              {[...report.tickets]
                .sort((a, b) => Number(b.isLanjutan) - Number(a.isLanjutan))
                .map((t) => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
```

Di `TicketRow`, sisipkan badge di dalam `<Td>` no tiket — tepat setelah `</span>` penutup (baris 226) dan sebelum `</Td>` (baris 227), jadi badge tampil sebagai baris kedua di bawah nomor tiket:

```tsx
          {ticket.isLanjutan && (
            <div className="mt-0.5">
              <Badge variant="info">Lanjutan</Badge>
            </div>
          )}
```

- [ ] **Step 6: Detail — tombol approve mengikuti peran**

Ganti kondisi blok approve (baris 144) `{!approved && canApprove && (` menjadi `{bisaApprove && (`, dan ganti teks tombol `Approve Laporan Shift` (baris 172) menjadi `{labelTombol}`.

- [ ] **Step 7: Verifikasi tipe & lint**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc8.log 2>&1; echo "tsc=$?"; tail -20 /tmp/tsc8.log
./node_modules/.bin/eslint components/supervisi app/\(app\)/supervisi > /tmp/lint8.log 2>&1; echo "lint=$?"; tail -20 /tmp/lint8.log
```

Expected: `tsc=0`, `lint=0`.

- [ ] **Step 8: Commit**

```bash
git add components/supervisi
git commit -m "feat(ui): peran & status dual-gate di menu Supervisi + badge tiket lanjutan"
```

---

### Task 9: Modal serah terima & tutup laporan

**Files:**
- Modify: `components/daily-monitoring/DailyMonitoringClient.tsx:99`, `:106`, `:424-440`, `:547-563`

**Interfaces:**
- Consumes: `shiftPakaiSupervisiNext` (Task 2). Komponen sudah menerima prop `currentShift: string` (baris 45/60).
- Produces: —

- [ ] **Step 1: Tambah turunan `perluSupervisiNext` & masukkan ke guard**

Sisipkan **setelah baris 93** (`const [hoReceiver, setHoReceiver] = useState("");`) dan sebelum baris 99 — BUKAN di dekat baris 75. `supervisiNextOk` membaca `hoSupervisiNext` yang baru dideklarasikan di baris 91; menaruhnya lebih atas menghasilkan error use-before-declaration:

```ts
  // Shift malam (C/E) wajib memilih supervisi selanjutnya — laporannya punya
  // blok tanda tangan kolom L. Shift lain: dropdown-nya tidak ditampilkan.
  const perluSupervisiNext = shiftPakaiSupervisiNext(currentShift);
  const supervisiNextOk = !perluSupervisiNext || Boolean(hoSupervisiNext);
```

Ganti baris 99:

```ts
  const canCloseShift = Boolean(hoInfra && hoDivisi && hoSupervisi) && supervisiNextOk;
```

Ganti kondisi baris 106 `hoInfra && hoDivisi && hoSupervisi && hoReceiver` menjadi:

```ts
    hoInfra && hoDivisi && hoSupervisi && hoReceiver && supervisiNextOk
```

Tambahkan import:

```ts
import { shiftPakaiSupervisiNext } from "@/lib/shiftReportApproval";
```

- [ ] **Step 2: Modal serah terima — dropdown bersyarat & wajib**

Ganti blok baris 424-440 dengan:

```tsx
          {perluSupervisiNext && (
            <div>
              <Select
                label="Supervisi Selanjutnya"
                required
                value={hoSupervisiNext}
                onChange={(e) => setHoSupervisiNext(e.target.value)}
              >
                <option value="">— Pilih supervisi selanjutnya —</option>
                {supervisiUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nama}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-gray-500">
                Wajib untuk shift malam — supervisi ini ikut approve &amp; tanda
                tangan laporan.
              </p>
            </div>
          )}
```

- [ ] **Step 3: Modal tutup laporan — blok identik**

Ganti blok baris 547-563 dengan kode yang sama persis seperti Step 2 (blok ini duplikat di modal tutup laporan; ulangi kodenya, jangan diringkas menjadi referensi).

- [ ] **Step 4: Pastikan payload shift A/B/D mengirim null**

Baris 171 dan 200 sudah mengirim `supervisiNextId: hoSupervisiNext || null`. Karena dropdown tidak dirender untuk A/B/D, `hoSupervisiNext` tetap `""` → terkirim `null`. Server juga memaksa `null` (Task 5). Tidak ada perubahan di sini — verifikasi saja:

```bash
grep -n "supervisiNextId: hoSupervisiNext" components/daily-monitoring/DailyMonitoringClient.tsx
```

Expected: 2 baris (171, 200).

- [ ] **Step 5: Verifikasi tipe & lint**

```bash
./node_modules/.bin/tsc --noEmit > /tmp/tsc9.log 2>&1; echo "tsc=$?"; tail -20 /tmp/tsc9.log
./node_modules/.bin/eslint components/daily-monitoring > /tmp/lint9.log 2>&1; echo "lint=$?"; tail -20 /tmp/lint9.log
```

Expected: `tsc=0`, `lint=0`.

- [ ] **Step 6: Verifikasi hasil edit pada file besar**

```bash
python3 -c "
ls=open('components/daily-monitoring/DailyMonitoringClient.tsx',encoding='utf-8').read().split('\n')
for i,l in enumerate(ls):
    if 'perluSupervisiNext' in l or 'supervisiNextOk' in l:
        print(i+1, l.strip()[:100])
"
```

Expected: 2 deklarasi + 2 pemakaian di guard + 2 pemakaian di JSX = 6 baris.

- [ ] **Step 7: Commit**

```bash
git add components/daily-monitoring/DailyMonitoringClient.tsx
git commit -m "feat(ui): supervisi selanjutnya wajib di modal shift C/E, disembunyikan di A/B/D"
```

---

### Task 10: Notifikasi Telegram untuk supervisi selanjutnya

**Files:**
- Modify: `lib/telegramNotif.ts:19-25` (interface), `:60-70` (`sendReportReminder`), tambah `buildSupervisiNextMessage`
- Modify: `lib/telegramScheduler.ts:20-26` (`fetchPendingReports`), `:34-45` (`notifyReportPending`)
- Modify: `app/api/shift-reports/[id]/approve/route.ts` (panggil notif sisa approval)
- Test: `lib/__tests__/telegramNotif.test.ts` (perluas + perbaiki assertion lama)

**Interfaces:**
- Consumes: `butuhApprovalSupervisiNext` (Task 2), `listTiketLanjutan`, `TiketLanjutanItem` (Task 7).
- Produces: `buildSupervisiNextMessage(report: PendingReportNotif): string`; **`sendReportReminder` berubah dari `Promise<boolean>` menjadi `Promise<number>`** (jumlah pesan terkirim).

**BREAKING CHANGE:** kontrak `sendReportReminder` berubah. `sendPendingReminders` harus memakai `sent += await ...` (bukan `sent++`), dan assertion boolean di `lib/__tests__/telegramNotif.test.ts:74` (`expect(ok).toBe(true)`) & `:91` (`expect(ok).toBe(false)`) harus jadi angka.

- [ ] **Step 1: Tulis test yang gagal**

Di `lib/__tests__/telegramNotif.test.ts`: ubah import agar menyertakan `buildSupervisiNextMessage`, ubah `expect(ok).toBe(true)` (baris 74) menjadi `expect(ok).toBe(1)` dan `expect(ok).toBe(false)` (baris 91) menjadi `expect(ok).toBe(0)`, lalu tambahkan di akhir file:

```ts
const reportC: PendingReportNotif = {
  shiftLabel: "Shift Malam (23:00–07:00)",
  shiftKode: "C",
  tanggal: new Date("2026-08-05T01:00:00Z"),
  ownerUser: { nama: "Kurnia" },
  supervisi: { nama: "Sup Utama", telegramChatId: "111" },
  supervisiNext: { nama: "Sup Next", telegramChatId: "222" },
  supervisiId: "u1",
  supervisiNextId: "u2",
  approvedAt: null,
  supervisiNextApprovedAt: null,
  tiketLanjutan: [
    { noTiket: "TKT-001", kodeAtm: "130004", namaAtm: "ATM RSUD SOLOK SELATAN" },
    { noTiket: "TKT-002", kodeAtm: "160009", namaAtm: "ATM KTR. BUPATI AGAM" },
  ],
};

describe("buildSupervisiNextMessage", () => {
  it("memuat identitas shift dan daftar tiket lanjutan", () => {
    const msg = buildSupervisiNextMessage(reportC);
    expect(msg).toContain("Shift Malam (23:00–07:00)");
    expect(msg).toContain("Sup Next");
    expect(msg).toContain("Kurnia");
    expect(msg).toContain("TKT-001");
    expect(msg).toContain("ATM KTR. BUPATI AGAM");
    expect(msg).toContain("(2)");
  });

  it("menyebut tidak ada tiket lanjutan bila daftarnya kosong", () => {
    const msg = buildSupervisiNextMessage({ ...reportC, tiketLanjutan: [] });
    expect(msg).toContain("Tidak ada tiket lanjutan");
  });

  it("memotong daftar di 10 tiket dan menyebut sisanya", () => {
    const banyak = Array.from({ length: 13 }, (_, i) => ({
      noTiket: `TKT-${i}`,
      kodeAtm: `K${i}`,
      namaAtm: `ATM ${i}`,
    }));
    const msg = buildSupervisiNextMessage({ ...reportC, tiketLanjutan: banyak });
    expect(msg).toContain("TKT-9");
    expect(msg).not.toContain("TKT-10");
    expect(msg).toContain("dan 3 tiket lainnya");
  });
});

describe("sendReportReminder — dua peran", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockFetch() {
    const f = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", f);
    return f;
  }

  it("mengirim ke kedua supervisi saat belum ada yang approve", async () => {
    const f = mockFetch();
    const sent = await sendReportReminder(reportC);
    expect(sent).toBe(2);
    const chatIds = f.mock.calls.map((c) => JSON.parse(c[1].body).chat_id);
    expect(chatIds.sort()).toEqual(["111", "222"]);
  });

  it("melewati peran yang sudah approve", async () => {
    const f = mockFetch();
    const sent = await sendReportReminder({
      ...reportC,
      approvedAt: new Date("2026-08-05T02:00:00Z"),
    });
    expect(sent).toBe(1);
    expect(JSON.parse(f.mock.calls[0][1].body).chat_id).toBe("222");
  });

  it("dedupe: satu orang dua peran → satu pesan berisi tiket lanjutan", async () => {
    const f = mockFetch();
    const sent = await sendReportReminder({
      ...reportC,
      supervisi: { nama: "Dimas", telegramChatId: "999" },
      supervisiNext: { nama: "Dimas", telegramChatId: "999" },
      supervisiId: "u9",
      supervisiNextId: "u9",
    });
    expect(sent).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.mock.calls[0][1].body).text).toContain("TKT-001");
  });

  it("shift A: supervisiNext diabaikan walau terisi (data lama)", async () => {
    const f = mockFetch();
    const sent = await sendReportReminder({
      ...reportC,
      shiftKode: "A",
      shiftLabel: "Shift Pagi (07:00–15:00)",
    });
    expect(sent).toBe(1);
    expect(JSON.parse(f.mock.calls[0][1].body).chat_id).toBe("111");
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan GAGAL**

```bash
./node_modules/.bin/vitest run lib/__tests__/telegramNotif.test.ts
```

Expected: FAIL — `buildSupervisiNextMessage` belum diekspor.

- [ ] **Step 3: Perluas `PendingReportNotif` + tambah builder**

Di `lib/telegramNotif.ts`, ganti interface (baris 19-25) dengan:

```ts
/** Satu tiket lanjutan yang ditampilkan di notif supervisi selanjutnya. */
export interface TiketLanjutanNotif {
  noTiket: string;
  kodeAtm: string;
  namaAtm: string;
}

/** Data minimal sebuah laporan shift yang dibutuhkan untuk menyusun notif. */
export interface PendingReportNotif {
  shiftLabel: string;
  /** Kode shift — penentu apakah supervisi selanjutnya ikut dinotifikasi. */
  shiftKode?: string;
  tanggal: Date | string;
  ownerUser?: { nama?: string | null } | null;
  supervisi?: { nama?: string | null; telegramChatId?: string | null } | null;
  supervisiNext?: { nama?: string | null; telegramChatId?: string | null } | null;
  supervisiId?: string | null;
  supervisiNextId?: string | null;
  approvedAt?: Date | null;
  supervisiNextApprovedAt?: Date | null;
  tiketLanjutan?: TiketLanjutanNotif[];
}

/** Batas tiket yang dirinci di pesan — sisanya diringkas (limit Telegram 4096 char). */
const MAX_TIKET_NOTIF = 10;
```

Tambahkan setelah `buildReminderMessage`:

```ts
/**
 * Pesan pengingat approval untuk SUPERVISI SELANJUTNYA (shift malam C/E).
 *
 * Berbeda dari pesan supervisi utama: memuat daftar tiket yang diteruskan ke
 * shift berikutnya, karena justru itulah yang perlu ia ketahui sebelum approve.
 */
export function buildSupervisiNextMessage(report: PendingReportNotif): string {
  const nama = report.supervisiNext?.nama ?? "Supervisi";
  const petugas = report.ownerUser?.nama ?? "-";
  const tiket = report.tiketLanjutan ?? [];
  const tampil = tiket.slice(0, MAX_TIKET_NOTIF);
  const sisa = tiket.length - tampil.length;
  const daftar =
    tiket.length === 0
      ? "🔁 Tidak ada tiket lanjutan pada shift ini."
      : `🔁 <b>Tiket lanjutan yang menjadi pemantauan Anda (${tiket.length}):</b>\n` +
        tampil.map((t) => `• ${t.noTiket} — ${t.kodeAtm} ${t.namaAtm}`).join("\n") +
        (sisa > 0 ? `\n• … dan ${sisa} tiket lainnya` : "");
  return (
    `🌙 <b>Approval Supervisi Selanjutnya — mtr-Report</b>\n\n` +
    `Halo ${nama}, laporan shift malam berikut menunggu persetujuan Anda:\n\n` +
    `📋 ${report.shiftLabel}\n` +
    `📅 ${fmtDate(report.tanggal)}\n` +
    `👤 Petugas: ${petugas}\n\n` +
    `${daftar}\n\n` +
    `Mohon approve di aplikasi agar laporan lengkap & TTD Anda terpasang.\n` +
    `<i>(Pengingat berulang tiap 1 jam, Senin–Jumat 07:00–18:00, sampai Anda approve)</i>`
  );
}
```

- [ ] **Step 4: Ubah `sendReportReminder` menjadi dua peran + dedupe**

Ganti seluruh `sendReportReminder` (baris 60-70) dengan:

```ts
/**
 * Kirim pengingat ke SEMUA peran laporan yang belum approve. Mengembalikan
 * jumlah pesan terkirim (0 bila tidak ada tujuan / semua sudah approve).
 * Tidak melempar error.
 */
export async function sendReportReminder(
  report: PendingReportNotif
): Promise<number> {
  const butuhNext = butuhApprovalSupervisiNext({
    shiftKode: report.shiftKode ?? "",
    supervisiNextId: report.supervisiNextId ?? null,
  });

  // Dedupe per chatId: bila orang yang sama memegang dua peran (supervisi utama
  // == supervisi selanjutnya, lihat lembar manual 01-08-2026 19-07) ia hanya
  // menerima SATU pesan. Pesan supervisi selanjutnya menang karena isinya
  // superset — memuat daftar tiket lanjutan.
  const tujuan = new Map<string, string>();
  if (!report.approvedAt && report.supervisi?.telegramChatId) {
    tujuan.set(report.supervisi.telegramChatId, buildReminderMessage(report));
  }
  if (
    butuhNext &&
    !report.supervisiNextApprovedAt &&
    report.supervisiNext?.telegramChatId
  ) {
    tujuan.set(
      report.supervisiNext.telegramChatId,
      buildSupervisiNextMessage(report)
    );
  }

  let sent = 0;
  for (const [chatId, text] of tujuan) {
    const res = await sendTelegramMessage(chatId, text);
    if (res.ok) sent++;
  }
  return sent;
}
```

Ganti isi loop `sendPendingReminders` — `if (await sendReportReminder(report)) sent++;` menjadi:

```ts
    sent += await sendReportReminder(report);
```

Tambahkan import:

```ts
import { butuhApprovalSupervisiNext } from "./shiftReportApproval";
```

- [ ] **Step 5: Jalankan test — pastikan LULUS**

```bash
./node_modules/.bin/vitest run lib/__tests__/telegramNotif.test.ts
```

Expected: PASS, termasuk test lama yang assertion-nya sudah diperbarui ke angka.

- [ ] **Step 6: Lengkapi data di `lib/telegramScheduler.ts`**

Ganti `fetchPendingReports` (baris 20-26) dengan:

```ts
/**
 * Lengkapi satu laporan dengan daftar tiket lanjutannya. Query tiket HANYA
 * dijalankan untuk laporan yang memang punya supervisi selanjutnya (shift C/E),
 * jadi shift A/B/D tidak menambah beban query sama sekali.
 */
async function withTiketLanjutan(r: {
  shiftKode: ShiftKode;
  tanggal: Date;
  supervisiNextId: string | null;
}): Promise<{ tiketLanjutan: TiketLanjutanNotif[] }> {
  const perlu = butuhApprovalSupervisiNext({
    shiftKode: r.shiftKode,
    supervisiNextId: r.supervisiNextId,
  });
  return {
    tiketLanjutan: perlu ? await listTiketLanjutan(r.shiftKode, r.tanggal) : [],
  };
}

/** Ambil semua laporan shift pending + relasi supervisi & owner untuk notif. */
export async function fetchPendingReports(): Promise<PendingReportNotif[]> {
  const reports = await prisma.shiftReport.findMany({
    where: { status: "pending" },
    include: { supervisi: true, supervisiNext: true, ownerUser: true },
  });
  return Promise.all(
    reports.map(async (r) => ({ ...r, ...(await withTiketLanjutan(r)) }))
  );
}
```

Ganti isi `notifyReportPending` (baris 34-45) — bagian query di dalam `try`:

```ts
    const report = await prisma.shiftReport.findUnique({
      where: { id: reportId },
      include: { supervisi: true, supervisiNext: true, ownerUser: true },
    });
    if (report) {
      await sendReportReminder({ ...report, ...(await withTiketLanjutan(report)) });
    }
```

Import: tambahkan `TiketLanjutanNotif` ke blok `import { ... } from "./telegramNotif";` yang SUDAH ADA (baris 13-18) sebagai `type TiketLanjutanNotif,` — jangan buat statement import kedua dari modul yang sama. Lalu tambahkan tiga import baru:

```ts
import type { ShiftKode } from "@prisma/client";
import { butuhApprovalSupervisiNext } from "./shiftReportApproval";
import { listTiketLanjutan } from "./shiftReportQueries";
```

- [ ] **Step 7: Panggil notif sisa approval setelah approve**

Di `app/api/shift-reports/[id]/approve/route.ts`, sisipkan tepat sebelum `return NextResponse.json({ ok: true, peran, status: patch.status });`:

```ts
  // Masih ada peran yang belum approve (shift malam) → ingatkan sekarang juga.
  // Dibungkus try/catch: kegagalan Telegram tidak boleh menggagalkan approve.
  if (patch.status === "pending") {
    try {
      await notifyReportPending(id);
    } catch (err) {
      console.error("[telegram] Gagal kirim notif sisa approval:", err);
    }
  }
```

Tambahkan import:

```ts
import { notifyReportPending } from "@/lib/telegramScheduler";
```

- [ ] **Step 8: Verifikasi penuh**

```bash
./node_modules/.bin/vitest run > /tmp/vitest10.log 2>&1; echo "vitest=$?"; tail -25 /tmp/vitest10.log
./node_modules/.bin/tsc --noEmit > /tmp/tsc10.log 2>&1; echo "tsc=$?"; tail -20 /tmp/tsc10.log
./node_modules/.bin/eslint . > /tmp/lint10.log 2>&1; echo "lint=$?"; tail -20 /tmp/lint10.log
```

Expected: `vitest=0`, `tsc=0`, `lint=0`.

- [ ] **Step 9: Commit**

```bash
git add lib/telegramNotif.ts lib/telegramScheduler.ts lib/__tests__/telegramNotif.test.ts "app/api/shift-reports/[id]/approve/route.ts"
git commit -m "feat(telegram): notif approval supervisi selanjutnya berisi daftar tiket lanjutan"
```

---

## Verifikasi Manual (setelah seluruh task selesai)

Butuh database + aplikasi berjalan; tidak tercakup unit test. Jalankan dev server lewat preview tool (bukan Bash).

- [ ] **1.** Serah terima shift **A** → dropdown "Supervisi Selanjutnya" TIDAK muncul di modal; laporan Excel tetap 5 blok TTD.
- [ ] **2.** Serah terima shift **C** tanpa memilih Supervisi Selanjutnya → tombol serah terima nonaktif. Panggil API langsung tanpa field itu → HTTP 400 `"Shift malam (C/E) wajib memilih Supervisi Selanjutnya."`
- [ ] **3.** Serah terima shift **C** lengkap → laporan muncul di menu Supervisi pada **dua** akun supervisi berbeda, dengan badge peran `Supervisi` dan `Supervisi Selanjutnya`.
- [ ] **4.** Download laporan harian shift C sebelum approve → 6 blok TTD; kolom `L` berisi nama tanpa gambar TTD.
- [ ] **5.** Supervisi utama approve → status berubah `Menunggu Supervisi Selanjutnya`; Excel: TTD supervisi utama MUNCUL, TTD kolom `L` belum.
- [ ] **6.** Supervisi selanjutnya approve → status `Sudah Diapprove`; Excel: TTD kolom `L` muncul, terpusat di kolom L dan tidak meluber ke kolom M.
- [ ] **7.** Kasus supervisi utama == supervisi selanjutnya → satu klik approve langsung `Sudah Diapprove`, dan hanya SATU pesan Telegram terkirim.
- [ ] **8.** Bandingkan hasil akhir dengan sheet `31-07-2026 23-07` di `Laporan Juli.xlsx` — posisi header, nama, dan lebar kolom `L`.

## Konsekuensi yang harus dilaporkan ke user saat selesai

Badge **"Status Supervisi"** di Daily Monitoring & Weekly Monitoring membaca `ShiftReport.status` lewat `buildShiftReportStatusMap` (`lib/shiftReportQueries.ts`). Karena `status` kini dual-gate, badge itu untuk shift C/E baru berubah hijau setelah KEDUA supervisi approve. Tidak ada perubahan kode di sana — tapi perilakunya berubah dan user perlu tahu.
