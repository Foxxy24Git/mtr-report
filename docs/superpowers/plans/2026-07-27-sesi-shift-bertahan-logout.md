# Sesi Shift Bertahan Melewati Logout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiket yang belum di-close tetap tampil & bisa diedit di Daily Monitoring setelah petugas logout lalu login kembali, selama shift-nya belum diserahterimakan atau ditutup.

**Architecture:** Sesi shift dipindahkan kepemilikannya dari cookie ke database. Kolom `users.current_shift` & `users.shift_started_at` sudah ada dan sudah diisi saat pilih shift, tapi tidak pernah dibaca balik saat login. Perbaikannya: (a) serah terima & tutup shift mengosongkan kedua kolom itu di DB — inilah satu-satunya cara sesi shift berakhir; (b) login memulihkan kedua kolom itu ke JWT, dibatasi umur maksimal 12 jam agar shift yang lupa ditutup tidak menggantung. Logout kembali ke maknanya semula: menutup sesi *login*, bukan sesi *shift*.

**Tech Stack:** Next.js 15 (App Router, route handlers), Prisma v6 + PostgreSQL, jose (JWT di cookie `mtr_session`), Vitest.

## Global Constraints

- Batas pemulihan sesi shift: **12 jam**, sejalan dengan `SESSION_MAX_AGE` di [lib/jwt.ts:7](../../../lib/jwt.ts) (`60 * 60 * 12`).
- `lib/shift.ts` diimpor oleh komponen klien [ShiftSelector.tsx](../../../components/dashboard/ShiftSelector.tsx) (`"use client"`). **Dilarang** mengimpor `lib/jwt.ts` dari `lib/shift.ts` — itu akan menarik paket `jose` ke bundle browser. Konstanta 12 jam ditulis ulang sebagai nilai literal dengan komentar penjelas.
- Komentar & pesan di kode ditulis dalam Bahasa Indonesia, mengikuti gaya berkas sekitarnya.
- Gunakan binary lokal (`./node_modules/.bin/...`), **bukan** `npx`.
- Urutan task tidak boleh ditukar: pembersihan sesi shift (Task 2 & 3) harus mendahului pemulihan saat login (Task 4), agar tidak ada commit yang memulihkan shift yang sudah ditutup.

## Yang TIDAK berubah (jangan disentuh)

- [lib/ticketQueries.ts:76-97](../../../lib/ticketQueries.ts) — filter `waktuOpen >= shiftStartedAt` **tetap apa adanya**. Filter itu sendiri benar; yang salah adalah `shiftStartedAt` yang ter-reset. Setelah perbaikan ini nilainya bertahan, sehingga filter bekerja sesuai maksud aslinya.
- [app/api/tickets/[id]/activities/route.ts](../../../app/api/tickets/[id]/activities/route.ts) — edit/tambah kegiatan hanya digerbang `ticket.shiftKode === session.shift`, tidak pernah menyentuh `shiftStartedAt`. Sudah benar.
- Weekly Monitoring, rekap, dan SLA — tidak memakai `shiftStartedAt`.

**Efek samping yang diinginkan:** lingkup `shiftScopeOR` di [handover/route.ts:87-93](../../../app/api/shift/handover/route.ts) dan [close/route.ts:68-74](../../../app/api/shift/close/route.ts) ikut terperbaiki tanpa diubah, karena keduanya membaca `session.shiftStartedAt` yang kini tidak lagi ter-reset. Tiket yang dibuat sebelum login ulang akan kembali masuk lingkup laporan shift.

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/shift.ts` (modifikasi) | Tambah `SHIFT_RESUME_MAX_AGE_MS` + fungsi murni `resumableShiftSession()` — satu-satunya tempat aturan "boleh dipulihkan atau tidak" |
| `lib/__tests__/shift.test.ts` (modifikasi) | Unit test untuk `resumableShiftSession()` |
| `app/api/shift/handover/route.ts` (modifikasi) | Kosongkan kolom sesi shift di DB saat serah terima |
| `app/api/shift/close/route.ts` (modifikasi) | Kosongkan kolom sesi shift di DB saat tutup laporan shift |
| `prisma/migrations/20260727000000_clear_stale_shift_session/migration.sql` (baru) | Bersihkan sisa data lama dari shift yang sudah ditutup sebelum perbaikan ini |
| `app/api/auth/login/route.ts` (modifikasi) | Pulihkan sesi shift dari DB ke JWT; bersihkan sesi yang kedaluwarsa |

---

### Task 1: Aturan pemulihan sesi shift (fungsi murni)

**Files:**
- Modify: `lib/shift.ts` (tambah di akhir berkas, setelah `nextShift`)
- Test: `lib/__tests__/shift.test.ts` (tambah di akhir berkas)

**Interfaces:**
- Consumes: `ALL_SHIFTS`, `ShiftCode` — sudah ada di `lib/shift.ts`
- Produces:
  - `SHIFT_RESUME_MAX_AGE_MS: number`
  - `interface ResumedShiftSession { shift: string; shiftStartedAt: string }`
  - `resumableShiftSession(currentShift: string | null | undefined, shiftStartedAt: Date | null | undefined, now?: Date): ResumedShiftSession`
  - Dipakai Task 4. Nilai balik sengaja bertipe `string` (bukan `Date`/`null`) agar langsung cocok dengan field `SessionPayload` di [lib/jwt.ts:9-22](../../../lib/jwt.ts).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `lib/__tests__/shift.test.ts`, dan ubah baris import paling atas berkas itu menjadi:

```ts
import { ALL_SHIFTS, nextShift, resumableShiftSession } from "../shift";
```

Lalu tambahkan blok test:

```ts
describe("resumableShiftSession", () => {
  const now = new Date("2026-07-27T16:00:00.000Z");
  const KOSONG = { shift: "", shiftStartedAt: "" };

  it("memulihkan shift yang dimulai 1 jam lalu (logout lalu login lagi)", () => {
    const mulai = new Date("2026-07-27T15:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual({
      shift: "B",
      shiftStartedAt: "2026-07-27T15:00:00.000Z",
    });
  });

  it("kosong bila petugas belum pernah memilih shift", () => {
    expect(resumableShiftSession(null, null, now)).toEqual(KOSONG);
  });

  it("kosong bila shift sudah diserahterimakan (kolom current_shift dikosongkan)", () => {
    const mulai = new Date("2026-07-27T15:00:00.000Z");
    expect(resumableShiftSession(null, mulai, now)).toEqual(KOSONG);
  });

  it("memulihkan tepat pada batas 12 jam", () => {
    const mulai = new Date("2026-07-27T04:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual({
      shift: "B",
      shiftStartedAt: "2026-07-27T04:00:00.000Z",
    });
  });

  it("kosong bila lewat 1 detik dari batas 12 jam", () => {
    const mulai = new Date("2026-07-27T03:59:59.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila sesi menggantung berhari-hari (lupa tutup shift)", () => {
    const mulai = new Date("2026-07-25T03:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila kode shift tidak dikenal", () => {
    const mulai = new Date("2026-07-27T15:00:00.000Z");
    expect(resumableShiftSession("Z", mulai, now)).toEqual(KOSONG);
  });

  it("kosong bila waktu mulai di masa depan (jam server bergeser)", () => {
    const mulai = new Date("2026-07-27T17:00:00.000Z");
    expect(resumableShiftSession("B", mulai, now)).toEqual(KOSONG);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
./node_modules/.bin/vitest run lib/__tests__/shift.test.ts
```

Expected: GAGAL. Vitest melaporkan error import — `resumableShiftSession is not a function` / `No "resumableShiftSession" export is defined on the module`.

- [ ] **Step 3: Tulis implementasi minimal**

Tambahkan di akhir `lib/shift.ts`:

```ts
/**
 * Batas usia sesi shift yang masih boleh dipulihkan saat login ulang: 12 jam.
 *
 * Ditulis sebagai konstanta lokal — BUKAN import SESSION_MAX_AGE dari
 * lib/jwt.ts — karena lib/shift.ts dipakai komponen klien ShiftSelector.tsx,
 * sehingga mengimpor lib/jwt.ts akan menarik paket `jose` ke bundle browser.
 * Nilainya harus dijaga tetap sama dengan SESSION_MAX_AGE (60 * 60 * 12 detik).
 */
export const SHIFT_RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface ResumedShiftSession {
  /** Kode shift (A–E), atau "" bila tidak ada sesi yang bisa dipulihkan. */
  shift: string;
  /** Awal sesi shift dalam ISO 8601, atau "" bila tidak ada. */
  shiftStartedAt: string;
}

/**
 * Tentukan sesi shift mana yang boleh dipulihkan saat petugas login kembali.
 *
 * Logout menutup sesi LOGIN, bukan sesi SHIFT: selama shift belum diserah-
 * terimakan atau ditutup, petugas harus dapat login ulang dan tetap memantau
 * serta mengedit tiketnya di Daily Monitoring. Sesi shift berakhir hanya lewat
 * serah terima / tutup laporan shift, yang mengosongkan currentShift &
 * shiftStartedAt di tabel users.
 *
 * Pengaman: sesi yang lebih tua dari SHIFT_RESUME_MAX_AGE_MS dianggap basi
 * (petugas lupa menutup shift) dan tidak dipulihkan — petugas diminta memilih
 * shift lagi di Dashboard.
 */
export function resumableShiftSession(
  currentShift: string | null | undefined,
  shiftStartedAt: Date | null | undefined,
  now: Date = new Date()
): ResumedShiftSession {
  const kosong: ResumedShiftSession = { shift: "", shiftStartedAt: "" };
  if (!currentShift || !ALL_SHIFTS.includes(currentShift as ShiftCode)) {
    return kosong;
  }
  if (!shiftStartedAt) return kosong;

  const mulai = shiftStartedAt.getTime();
  if (Number.isNaN(mulai)) return kosong;

  const usia = now.getTime() - mulai;
  // usia < 0 → waktu mulai di masa depan (jam server bergeser): jangan dipercaya.
  if (usia < 0 || usia > SHIFT_RESUME_MAX_AGE_MS) return kosong;

  return { shift: currentShift, shiftStartedAt: shiftStartedAt.toISOString() };
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
./node_modules/.bin/vitest run lib/__tests__/shift.test.ts
```

Expected: LULUS — 11 test (3 lama + 8 baru).

- [ ] **Step 5: Commit**

```bash
git add lib/shift.ts lib/__tests__/shift.test.ts && git commit -m "feat: aturan pemulihan sesi shift saat login ulang (maks 12 jam)"
```

---

### Task 2: Serah terima & tutup shift mengosongkan sesi shift di DB

**Files:**
- Modify: `app/api/shift/handover/route.ts:144-160`
- Modify: `app/api/shift/close/route.ts:117-131`

**Interfaces:**
- Consumes: `tx` (Prisma transaction client) dan `session.sub` yang sudah ada di kedua route
- Produces: jaminan bahwa setelah serah terima / tutup shift, `users.current_shift` dan `users.shift_started_at` bernilai `NULL`. Task 4 bergantung penuh pada jaminan ini.

**Kenapa ini didahulukan:** hari ini kedua route hanya mengosongkan JWT ([handover/route.ts:174](../../../app/api/shift/handover/route.ts), [close/route.ts:144](../../../app/api/shift/close/route.ts)) dan meninggalkan kolom DB tetap terisi. Kalau Task 4 dikerjakan lebih dulu, petugas yang sudah serah terima lalu login lagi akan dilempar balik ke shift yang sudah ditutup.

- [ ] **Step 1: Ubah handover — masukkan pengosongan ke dalam transaksi**

Di `app/api/shift/handover/route.ts`, ganti blok `return tx.shiftReport.create({...});` (baris 144-159) menjadi:

```ts
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
        supervisiNextId,
        pimpinanInfraId,
        pimpinanDivisiId,
        handoverId: handover.id,
      },
    });

    // Sesi shift benar-benar berakhir: kosongkan penandanya di DB, bukan hanya
    // di cookie. Inilah yang mencegah login berikutnya memulihkan shift yang
    // sudah diserahterimakan (lihat resumableShiftSession di lib/shift.ts).
    await tx.user.update({
      where: { id: session.sub },
      data: { currentShift: null, shiftStartedAt: null },
    });

    return shiftReport;
```

- [ ] **Step 2: Ubah close — pengosongan yang sama**

Di `app/api/shift/close/route.ts`, ganti blok `return tx.shiftReport.create({...});` (baris 117-130) menjadi:

```ts
    const shiftReport = await tx.shiftReport.create({
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

    // Sesi shift benar-benar berakhir: kosongkan penandanya di DB, bukan hanya
    // di cookie. Inilah yang mencegah login berikutnya memulihkan shift yang
    // sudah ditutup (lihat resumableShiftSession di lib/shift.ts).
    await tx.user.update({
      where: { id: session.sub },
      data: { currentShift: null, shiftStartedAt: null },
    });

    return shiftReport;
```

- [ ] **Step 3: Verifikasi tipe**

```bash
./node_modules/.bin/tsc --noEmit > /private/tmp/claude-501/-Users-user-mtr-Report/fbbd16fa-f99b-4241-8129-9ba021123beb/scratchpad/tsc.log 2>&1; tail -20 /private/tmp/claude-501/-Users-user-mtr-Report/fbbd16fa-f99b-4241-8129-9ba021123beb/scratchpad/tsc.log
```

Expected: tidak ada output error (berkas log kosong). Bila muncul error, `report` di kedua route harus tetap bertipe `ShiftReport` — pastikan `return shiftReport;` ada di akhir callback transaksi.

- [ ] **Step 4: Jalankan seluruh test, pastikan tidak ada regresi**

```bash
./node_modules/.bin/vitest run
```

Expected: seluruh suite LULUS.

- [ ] **Step 5: Commit**

```bash
git add app/api/shift/handover/route.ts app/api/shift/close/route.ts && git commit -m "fix: serah terima & tutup shift kosongkan sesi shift di DB, bukan hanya cookie"
```

---

### Task 3: Bersihkan sisa sesi shift dari data lama

**Files:**
- Create: `prisma/migrations/20260727000000_clear_stale_shift_session/migration.sql`

**Interfaces:**
- Consumes: tabel `users` (`current_shift`, `shift_started_at`) dan `shift_handovers` (`from_user`, `at`) — lihat `@@map` di [prisma/schema.prisma:110](../../../prisma/schema.prisma) dan [prisma/schema.prisma:286](../../../prisma/schema.prisma)
- Produces: tidak ada API baru. Menjamin kondisi awal DB konsisten dengan Task 2 sebelum Task 4 aktif.

**Kenapa perlu:** Task 2 hanya membersihkan shift yang ditutup *mulai sekarang*. Petugas yang serah terima **sebelum** deploy masih menyisakan `current_shift` terisi. Tanpa pembersihan ini, login pertama mereka pasca-deploy akan memulihkan shift yang sudah ditutup. (Cakupan risikonya memang sempit — batas 12 jam sudah menyaring baris yang lebih tua — tapi baris dalam 12 jam terakhir tetap harus dibereskan.)

**Deteksi baris kotor:** ada baris `shift_handovers` milik user tersebut dengan `at >= shift_started_at`, artinya sesi shift itu sudah pernah diakhiri. Perhatikan bahwa `close` juga membuat baris `shift_handovers` ([close/route.ts:85-95](../../../app/api/shift/close/route.ts)), jadi satu query menangkap kedua jalur.

- [ ] **Step 1: Buat berkas migrasi**

Buat `prisma/migrations/20260727000000_clear_stale_shift_session/migration.sql`:

```sql
-- Sesi shift kini dipulihkan saat login (lihat resumableShiftSession di
-- lib/shift.ts). Sebelum perubahan ini, serah terima / tutup laporan shift
-- hanya mengosongkan cookie sesi dan meninggalkan users.current_shift tetap
-- terisi. Bersihkan sisa data tersebut agar login pertama setelah deploy tidak
-- memulihkan shift yang sebenarnya sudah ditutup.
--
-- Baris dianggap kotor bila petugas punya catatan serah terima / tutup shift
-- (shift_handovers) yang terjadi pada atau sesudah awal sesi shift tersimpan.
UPDATE users u
SET current_shift = NULL,
    shift_started_at = NULL
WHERE u.current_shift IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM shift_handovers h
    WHERE h.from_user = u.id
      AND (u.shift_started_at IS NULL OR h.at >= u.shift_started_at)
  );
```

- [ ] **Step 2: Periksa dulu baris mana yang akan terkena (sebelum apply)**

```bash
./node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma <<'SQL'
SELECT u.username, u.current_shift, u.shift_started_at
FROM users u
WHERE u.current_shift IS NOT NULL
  AND EXISTS (SELECT 1 FROM shift_handovers h WHERE h.from_user = u.id
              AND (u.shift_started_at IS NULL OR h.at >= u.shift_started_at));
SQL
```

Expected: daftar petugas yang shift-nya sudah ditutup tapi kolomnya masih terisi. **Catat hasilnya.** Kalau kosong, migrasi tetap dibuat dan di-apply (no-op) supaya riwayat migrasi konsisten antar lingkungan.

- [ ] **Step 3: Terapkan migrasi**

```bash
./node_modules/.bin/prisma migrate deploy
```

Expected: `Applying migration '20260727000000_clear_stale_shift_session'` lalu `All migrations have been successfully applied.`

- [ ] **Step 4: Verifikasi hasil**

```bash
./node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma <<'SQL'
SELECT u.username, u.current_shift, u.shift_started_at
FROM users u
WHERE u.current_shift IS NOT NULL
  AND EXISTS (SELECT 1 FROM shift_handovers h WHERE h.from_user = u.id
              AND (u.shift_started_at IS NULL OR h.at >= u.shift_started_at));
SQL
```

Expected: 0 baris. Petugas yang shift-nya masih berjalan (belum serah terima) **tidak** ikut terhapus — pastikan akun Anda yang punya tiket terbuka masih memegang `current_shift`.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/20260727000000_clear_stale_shift_session && git commit -m "chore(db): bersihkan sisa sesi shift dari shift yang sudah ditutup"
```

---

### Task 4: Login memulihkan sesi shift

**Files:**
- Modify: `app/api/auth/login/route.ts:1-6` (import), `:35-49` (update + signSession)

**Interfaces:**
- Consumes: `resumableShiftSession` dari Task 1; jaminan kolom DB dikosongkan dari Task 2 & 3
- Produces: JWT hasil login kini berisi `shift` & `shiftStartedAt` yang dipulihkan. Dikonsumsi tanpa perubahan oleh [daily-monitoring/page.tsx:16-17](../../../app/(app)/daily-monitoring/page.tsx), [dashboard/page.tsx:62](../../../app/(app)/dashboard/page.tsx), [tickets/route.ts:44-45](../../../app/api/tickets/route.ts), serta route handover & close.

- [ ] **Step 1: Tambah import**

Di `app/api/auth/login/route.ts`, tambahkan setelah baris import `Role`:

```ts
import { resumableShiftSession } from "@/lib/shift";
```

- [ ] **Step 2: Pulihkan sesi shift & bersihkan yang kedaluwarsa**

Ganti blok baris 35-49 (dari komentar `// Catat waktu login terakhir` sampai penutup `signSession`) menjadi:

```ts
  // Sesi shift bertahan melewati logout: logout menutup sesi login, bukan sesi
  // shift. Selama shift belum diserahterimakan / ditutup (yang mengosongkan
  // kolom ini di DB), petugas tetap dapat memantau & mengedit tiketnya di
  // Daily Monitoring setelah login kembali.
  const resumed = resumableShiftSession(user.currentShift, user.shiftStartedAt);

  // Catat waktu login terakhir (kolom Member Dashboard Super Admin). Sekaligus
  // bersihkan sesi shift yang sudah kedaluwarsa (>12 jam — petugas lupa menutup
  // shift) agar kolom "Shift Aktif" di dashboard Super Admin tidak menyesatkan.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLogin: new Date(),
      ...(resumed.shift ? {} : { currentShift: null, shiftStartedAt: null }),
    },
  });

  const token = await signSession({
    sub: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role as Role,
    shift: resumed.shift,
    shiftStartedAt: resumed.shiftStartedAt,
  });
```

- [ ] **Step 3: Perbarui komentar dokumentasi yang kini keliru**

Di `lib/jwt.ts`, ganti komentar pada baris 16-20 (di atas field `shiftStartedAt`) menjadi:

```ts
  /**
   * Awal sesi shift (ISO 8601). Diisi saat user memilih shift, dipulihkan dari
   * DB saat login ulang (maks 12 jam — lihat resumableShiftSession), dan
   * dikosongkan saat serah terima / tutup laporan shift. Dipakai Daily
   * Monitoring untuk membatasi tiket pada shift session yang sedang berjalan
   * (PRD revisi §4.B).
   */
```

Di `lib/ticketQueries.ts`, ganti baris 36-37 (komentar "Tiket hilang hanya saat...") menjadi:

```ts
   * Tiket hilang hanya saat shift berakhir (serah terima / tutup laporan
   * shift), yang mengosongkan shift sesi sehingga query mengembalikan [].
   * Logout TIDAK mengakhiri sesi shift — sesi dipulihkan saat login kembali.
```

- [ ] **Step 4: Verifikasi tipe & seluruh test**

```bash
./node_modules/.bin/tsc --noEmit > /private/tmp/claude-501/-Users-user-mtr-Report/fbbd16fa-f99b-4241-8129-9ba021123beb/scratchpad/tsc.log 2>&1; tail -20 /private/tmp/claude-501/-Users-user-mtr-Report/fbbd16fa-f99b-4241-8129-9ba021123beb/scratchpad/tsc.log
```

Expected: tidak ada output error. `user.currentShift` bertipe `ShiftKode | null` dan `user.shiftStartedAt` bertipe `Date | null` — keduanya cocok dengan parameter `resumableShiftSession`.

```bash
./node_modules/.bin/vitest run
```

Expected: seluruh suite LULUS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login/route.ts lib/jwt.ts lib/ticketQueries.ts && git commit -m "fix: tiket belum close tetap tampil di Daily Monitoring setelah login ulang"
```

---

### Task 5: Verifikasi end-to-end di aplikasi berjalan

**Files:** tidak ada perubahan kode. Task ini membuktikan bug asli benar-benar hilang.

**Interfaces:**
- Consumes: seluruh perubahan Task 1-4

- [ ] **Step 1: Jalankan dev server**

Gunakan preview_start (jangan `npm run dev` lewat Bash). Bila `.claude/launch.json` belum ada, buat dengan isi:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "mtr-report", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```

- [ ] **Step 2: Reproduksi skenario asli**

1. Login sebagai petugas (role `user`).
2. Dashboard → pilih **Shift Sore (15:00–23:00)** = kode **B**.
3. Open Tiket → buat 1 tiket baru, isi kegiatan pertama.
4. Daily Monitoring → pastikan tiket tampil. **Catat nomor tiketnya.**

- [ ] **Step 3: Uji perbaikan utama — logout lalu login**

1. Logout.
2. Login lagi dengan akun yang sama.
3. **Expected:** Dashboard langsung menampilkan Shift Sore sebagai shift aktif (tanpa perlu memilih ulang).
4. Buka Daily Monitoring. **Expected:** tiket dari Step 2 **masih tampil**.
5. Klik tiket → tambahkan satu kegiatan penanganan. **Expected:** tersimpan tanpa error.

- [ ] **Step 4: Uji pengaman — shift yang sudah ditutup tidak boleh hidup lagi**

1. Dari Daily Monitoring, lakukan **Tutup Laporan Shift** (atau serah terima).
2. **Expected:** Daily Monitoring kosong.
3. Logout, lalu login lagi.
4. **Expected:** Dashboard menampilkan "Belum memilih shift" — shift **tidak** dipulihkan, dan Daily Monitoring tetap kosong.

- [ ] **Step 5: Periksa error di konsol & log server**

Gunakan read_console_messages dan preview_logs. Expected: tidak ada error terkait sesi/shift.

- [ ] **Step 6: Commit (bila ada perbaikan lanjutan dari verifikasi)**

Bila Step 3 atau 4 gagal, **JANGAN** menambal gejalanya. Kembali ke Phase 1 systematic-debugging: telusuri apakah `users.current_shift` benar-benar `NULL` setelah tutup shift, dan apakah JWT hasil login benar berisi `shift`.

---

## Ringkasan efek

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Buat tiket → logout → login → Daily Monitoring | Tiket hilang ❌ | Tiket tampil & bisa diedit ✅ |
| Buat tiket → logout → login → serah terima | Tiket tak masuk laporan shift ❌ | Tiket masuk laporan shift ✅ |
| Serah terima / tutup shift → login lagi | (tidak relevan) | Shift tidak dipulihkan ✅ |
| Lupa tutup shift → login 2 hari kemudian | (tidak relevan) | Sesi basi, diminta pilih shift lagi ✅ |
| Shift bernama sama dari sesi kemarin | Tidak tercampur ✅ | Tidak tercampur ✅ (perilaku dipertahankan) |
