# Supervisi Selanjutnya — TTD, Approval Ganda & Notif Telegram (Shift C & E)

**Tanggal:** 5 Agustus 2026
**Status:** Spec disetujui, siap dijadikan rencana implementasi
**Ruang lingkup:** Laporan HARIAN saja (`lib/excelReport.ts`). Rekap Lengkap, Weekly ZIP, dan Logbook per User TIDAK berubah.

---

## 1. Latar belakang

Shift malam **C (23:00–07:00)** dan **E (19:00–07:00)** melewati tengah malam, sehingga
petugas menyerahkan tiket yang masih proses ke supervisi yang berbeda dari supervisi
yang mendampingi awal shift. Pada laporan manual (`Laporan Juli.xlsx`), sheet shift C dan
E punya **6 blok tanda tangan**, sedangkan shift A/B hanya 5:

| Kolom | `C:D` | `F:G` | `I:J` | **`L`** | `O:P` | `R:S` |
|---|---|---|---|---|---|---|
| Header | Petugas Monitoring yang menyerahkan | Petugas Monitoring yang Menerima | Supervisi | **Supervisi Selanjutnya** | Mengetahui,\nBag. Infrastruktur TI | Mengetahui,\nPemimpin Divisi |

Bukti dari file manual:

- Sheet `31-07-2026 23-07` (shift C): `C25/F25/I25/L25/O25/R25` = header, `C30/F30/I30/L30/O30/R30` = nama.
  Merge header: `C25:D27`, `F25:G27`, `I25:J27`, **`L25:L27`**, `O25:P27`, `R25:S27`.
- Sheet `01-08-2026 19-07` (shift E): pola identik di baris 22 (header) & 27 (nama).
  Di sheet ini `I27` dan `L27` berisi nama **orang yang sama** (`Dimas Teguh`) — jadi
  supervisi utama boleh sama dengan supervisi selanjutnya.
- Sheet `31-07-2026 07-15` (shift A) & `31-07-2026 15-23` (shift B): hanya 5 blok,
  **tanpa** kolom `L`.

Catatan penting layout: blok `L` **merge 1 kolom saja** (`L25:L27`), tidak 2 kolom
seperti blok lain. Baris nama `L30` tidak di-merge sama sekali.

## 2. Kondisi kode saat ini

`supervisiNextId` **sudah ada** dan sudah tersimpan, tetapi tidak pernah dipakai:

| Tempat | Kondisi |
|---|---|
| `prisma/schema.prisma` | `ShiftHandover.supervisiNextId` (baris 275) & `ShiftReport.supervisiNextId` (baris 300) + relasi — sudah ada |
| `app/api/shift/handover/route.ts:47-50, 120, 168` | Sudah disimpan ke `ShiftHandover` + `ShiftReport` |
| `app/api/shift/close/route.ts:45-48, 101, 131` | Sama |
| `components/daily-monitoring/DailyMonitoringClient.tsx:426, 549` | Dropdown "Supervisi Selanjutnya" — **opsional untuk semua shift** |
| `lib/excelReport.ts:781-787` | Hanya 5 blok TTD, tidak ada kolom `L` |
| `lib/shiftReport.ts` | `resolveShiftReportSignatures` tidak tahu supervisi selanjutnya |
| `lib/shiftReportQueries.ts` | `listShiftReports` filter `supervisiId` saja |
| `app/api/shift-reports/[id]/approve/route.ts` | Hanya `report.supervisiId` yang boleh approve |
| `lib/telegramNotif.ts:66` | Reminder hanya ke `report.supervisi.telegramChatId` |

Blok tanda tangan hanya ada di `lib/excelReport.ts` (sudah diverifikasi:
`grep -l "Petugas Monitoring yang menyerahkan" lib/*.ts` → `excelReport.ts` + `reportSignatures.ts`).

## 3. Keputusan desain (sudah disetujui user)

1. **Dual-gate approval.** `ShiftReport.status` baru menjadi `"approved"` setelah
   **kedua** supervisi approve. Selama salah satu belum, status tetap `"pending"`.
2. **Dropdown wajib untuk C & E, disembunyikan untuk A/B/D.** Serah terima / tutup
   laporan shift C atau E ditolak (400) bila `supervisiNextId` kosong. Untuk A/B/D,
   server **memaksa** `supervisiNextId = null` walau klien mengirim nilai.
3. **Blok `L` selalu tampil di laporan C/E**, walau `supervisiNext` kosong (data lama)
   — nama diisi `( ………………………… )` agar bisa ditandatangani manual. Konsisten dengan
   perilaku blok lain di `lib/excelReport.ts:803`.
4. **Notif Telegram khusus** untuk supervisi selanjutnya: menyebut shift/tanggal/petugas
   **plus daftar tiket lanjutan** (no tiket + lokasi ATM), lalu minta approve.

## 4. Perubahan skema (migrasi Prisma)

Tambahkan ke `model ShiftReport`:

```prisma
  supervisiNextApprovedAt   DateTime? @map("supervisi_next_approved_at")
  supervisiNextApprovedById String?   @map("supervisi_next_approved_by")
  catatanSupervisiNext      String?   @map("catatan_supervisi_next")

  supervisiNextApprover User? @relation("ShiftReportSupervisiNextApprover", fields: [supervisiNextApprovedById], references: [id])
```

Tambah index: `@@index([supervisiNextId, status])` (sejajar `@@index([supervisiId, status])`
yang sudah ada).

Tambah sisi balik relasi di `model User`. **Tidak ada kolom `status` baru** — status
gabungan tetap `ShiftReport.status`; state "sebagian" diturunkan dari timestamp approval.

> Migrasi additive (semua kolom nullable) → data lama aman, tidak perlu backfill.
> Jalankan dengan `./node_modules/.bin/prisma migrate dev --name supervisi_next_approval`
> (pakai binary lokal, bukan `npx` — lihat catatan di §10).

## 5. Modul baru: `lib/shiftReportApproval.ts` (fungsi murni, tanpa DB)

Semua aturan dual-gate dikumpulkan di satu modul murni agar bisa di-unit-test tanpa
database — pola yang sama dengan `lib/reportSignatures.ts` dan `lib/telegramNotif.ts`.

```ts
/** Shift malam yang laporannya punya blok "Supervisi Selanjutnya" (Form OPS-001). */
export const SHIFT_SUPERVISI_NEXT: ReadonlySet<string> = new Set(["C", "E"]);

export function shiftPakaiSupervisiNext(shiftKode: string): boolean;

/**
 * True bila laporan ini WAJIB di-approve juga oleh supervisi selanjutnya.
 * Sengaja mengecek shiftKode DAN supervisiNextId: laporan lama shift A/B/D bisa
 * saja punya supervisiNextId (dropdown dulu tampil di semua shift) — laporan itu
 * tidak boleh mendadak butuh approval kedua.
 */
export function butuhApprovalSupervisiNext(r: {
  shiftKode: string;
  supervisiNextId: string | null;
}): boolean;

export type PeranApproval = "utama" | "selanjutnya" | "keduanya" | null;

/**
 * Peran user terhadap sebuah laporan. "keduanya" bila orang yang sama dipilih
 * sebagai supervisi utama DAN supervisi selanjutnya (kasus nyata: sheet manual
 * 01-08-2026 19-07, I27 == L27). Satu klik approve menuntaskan dua-duanya.
 */
export function resolvePeranApproval(
  r: { shiftKode: string; supervisiId: string | null; supervisiNextId: string | null },
  userId: string
): PeranApproval;

/** "pending" sampai semua approval yang diwajibkan terisi. */
export function hitungStatusLaporan(r: {
  shiftKode: string;
  supervisiNextId: string | null;
  approvedAt: Date | null;
  supervisiNextApprovedAt: Date | null;
}): "pending" | "approved";

export type LabelApproval =
  | "Menunggu Approval"
  | "Menunggu Supervisi Utama"
  | "Menunggu Supervisi Selanjutnya"
  | "Sudah Diapprove";

/** Label untuk badge di menu Supervisi & detail laporan. */
export function labelApproval(r: {
  shiftKode: string;
  supervisiNextId: string | null;
  approvedAt: Date | null;
  supervisiNextApprovedAt: Date | null;
}): LabelApproval;
```

Aturan `labelApproval`:

| `approvedAt` | `supervisiNextApprovedAt` | butuh next? | Label |
|---|---|---|---|
| null | — | tidak | Menunggu Approval |
| ada | — | tidak | Sudah Diapprove |
| null | null | ya | Menunggu Approval |
| ada | null | ya | Menunggu Supervisi Selanjutnya |
| null | ada | ya | Menunggu Supervisi Utama |
| ada | ada | ya | Sudah Diapprove |

## 6. Blok tanda tangan di Excel

### 6.1 `lib/shiftReport.ts`

Perluas `ShiftReportSignerInput`:

```ts
  shiftKode: string;
  supervisiNext?: { nama?: string | null; ttdUrl?: string | null } | null;
  /** Approval supervisi UTAMA — menggantikan `status` sebagai gate TTD utama. */
  approvedAt?: Date | null;
  supervisiNextApprovedAt?: Date | null;
```

Field `status` yang sudah ada **tetap dipertahankan** di input (dipakai pemanggil lain
& sebagai fallback bila `approvedAt` tidak dikirim), tetapi bukan lagi sumber gate TTD.

Perluas `ShiftReportSignatures`:

```ts
  /** True untuk shift C & E → blok kolom L dicetak. */
  showSupervisiNext: boolean;
  supervisiNext: string;
  supervisiNextApproved: boolean;
  supervisiNextTtdPath: string | null;
```

Aturan (persis pola supervisi utama yang sudah ada di baris 47-49): nama **selalu**
ikut bila `showSupervisiNext`; TTD hanya bila `supervisiNextApprovedAt != null`.

> **Penting — jangan ubah semantik `supervisiApproved` yang lama.** Field itu meng-gate
> TTD supervisi UTAMA saja. Karena `status` kini dual-gate, `supervisiApproved` harus
> beralih memakai `approvedAt != null`, **bukan** `status === "approved"` — kalau tidak,
> TTD supervisi utama akan hilang lagi setiap kali supervisi selanjutnya belum approve.
> Ini satu-satunya perubahan perilaku pada kode lama; sertakan test regresinya.

### 6.2 `lib/excelReport.ts`

Tambahkan field ke `ReportSignatures` (baris 66) sesuai §6.1, lalu di array `blocks`
(baris 781-787) sisipkan blok `L` **di antara** blok `I:J` dan `O:P`:

```ts
    ...(sig.showSupervisiNext
      ? [{ c1: "L", c2: "L", imgCol: 11, title: "Supervisi Selanjutnya",
           nama: sig.supervisiNext, ttdPath: sig.supervisiNextTtdPath,
           signer: true, show: sig.supervisiNextApproved }]
      : []),
```

`imgCol: 11` = indeks 0-based kolom L (A=0 … L=11), konsisten dengan C=2, F=5, I=8,
O=14, R=17.

Dua penyesuaian wajib karena blok ini `c1 === c2`:

1. **Guard merge 1 sel.** `ws.mergeCells("L31:L31")` adalah range degenerate — jangan
   panggil `mergeCells` untuk baris nama saat `c1 === c2`. Merge header
   (`L26:L28`) tetap valid karena membentang 3 baris.
2. **Perhitungan titik tengah TTD** (baris 827-828) saat ini menjumlahkan lebar
   `c1 + c2`; untuk blok 1 kolom itu menggandakan lebar. Ubah menjadi:

```ts
        const w1 = colPx(COL_WIDTHS[b.c1]);
        const w2 = b.c2 === b.c1 ? 0 : colPx(COL_WIDTHS[b.c2]);
        let leftPx = Math.max(0, (w1 + w2 - TTD_W) / 2);
```

`COL_WIDTHS.L = 35.43` → lebar render ≈ 253px, `TTD_W = 130` → TTD tetap muat dan
terpusat tanpa meluber ke kolom M.

Print area (`A1:S${nameRow}`, baris 848) tidak berubah — kolom L sudah di dalamnya.

### 6.3 `lib/reportData.ts`

Pada query `shiftReport` (baris 262-278) tambahkan `supervisiNext: { select: { nama: true, ttdUrl: true } }`
ke `include`, dan pastikan `shiftKode` + `supervisiNextId` + `supervisiNextApprovedAt`
ikut terbaca. Teruskan hasil `resolveShiftReportSignatures` ke objek `signatures`
(baris 298-308).

Untuk **cabang fallback** (laporan lama tanpa `ShiftReport`, baris 309+): ambil
`supervisiNext` dari `handover` (tambahkan ke `include` di baris 250-256),
`showSupervisiNext = shift === "C" || shift === "E"`, dan
`supervisiNextTtdPath = null` (tanpa record approval, TTD tidak boleh ditempel).

## 7. Serah terima & tutup laporan

Di **`app/api/shift/handover/route.ts`** dan **`app/api/shift/close/route.ts`**, setelah
`fromShift` diketahui (handover baris 70, close baris 59) — **bukan** di blok parsing
body baris 47/45, karena `fromShift` belum tersedia di sana:

```ts
  const wajibNext = shiftPakaiSupervisiNext(fromShift);
  // A/B/D: paksa null walau klien mengirim — laporannya tidak punya kolom ini.
  const supervisiNextFinal = wajibNext ? supervisiNextId : null;
  if (wajibNext && !supervisiNextFinal) {
    return NextResponse.json(
      { error: "Shift malam (C/E) wajib memilih Supervisi Selanjutnya." },
      { status: 400 }
    );
  }
```

Pakai `supervisiNextFinal` pada `shiftHandover.create` dan `shiftReport.create`.

**Supervisi utama boleh sama dengan supervisi selanjutnya** — jangan tambahkan validasi
yang melarangnya (dibuktikan sheet manual `01-08-2026 19-07`).

## 8. Endpoint approve

`app/api/shift-reports/[id]/approve/route.ts` — ganti pengecekan tunggal
`report.supervisiId !== session.sub` (baris 44) dengan resolusi peran:

```ts
  const peran = resolvePeranApproval(report, session.sub);
  if (!peran) return 403 "Laporan ini bukan tanggung jawab supervisi Anda.";
```

Aturan penulisan:

| Peran | Yang ditulis |
|---|---|
| `utama` | `approvedAt`, `approvedById`, `catatanSupervisi` |
| `selanjutnya` | `supervisiNextApprovedAt`, `supervisiNextApprovedById`, `catatanSupervisiNext` |
| `keduanya` | kedua set di atas sekaligus (satu klik) |

Setelah menulis, hitung ulang `status` dengan `hitungStatusLaporan(...)` memakai nilai
BARU (bukan nilai lama dari `findUnique`) dan simpan dalam satu `update`.

Konflik 409 per peran, bukan per laporan:

- peran `utama` & `approvedAt` sudah terisi → 409 `"Anda sudah menyetujui laporan ini."`
- peran `selanjutnya` & `supervisiNextApprovedAt` sudah terisi → 409 sama
- peran `keduanya` → 409 hanya bila **kedua**-nya sudah terisi

Setelah approve berhasil, panggil notif Telegram lanjutan bila masih ada peran yang
belum approve (lihat §9) — dibungkus try/catch, tidak boleh menggagalkan response.

## 9. Menu Supervisi (list + detail)

### 9.1 `lib/shiftReportQueries.ts`

`ShiftReportListFilter` — tambahkan `viewerId?: string | null`. Dua field ini punya
tugas berbeda dan **tidak boleh disatukan**: `supervisiId` menentukan *scoping* (baris
mana yang tampil; `null` = superadmin melihat semua), sedangkan `viewerId` hanya dipakai
menghitung `peran` per baris. Superadmin mengirim `supervisiId: null` + `viewerId:
session.sub`, sehingga ia melihat semua laporan dengan `peran: null` (tombol approve
tidak aktif — endpoint approve memang menolak role selain `supervisi`).

Ubah scoping `listShiftReports`:

```ts
  if (f.supervisiId) {
    where.OR = [
      { supervisiId: f.supervisiId },
      { supervisiNextId: f.supervisiId, shiftKode: { in: ["C", "E"] } },
    ];
  }
```

`ShiftReportListItem` — tambahkan:

```ts
  supervisiNama: string | null;
  supervisiNextNama: string | null;
  approvedAt: Date | null;
  supervisiNextApprovedAt: Date | null;
  /** Peran viewer atas laporan ini — menentukan tombol approve mana yang aktif. */
  peran: PeranApproval;
  /** Hasil labelApproval() — dipakai badge di tabel. */
  labelApproval: LabelApproval;
  /** Jumlah tiket yang ditandai tindak lanjut ke shift berikutnya. */
  jmlTiketLanjutan: number;
```

`getShiftReportDetail` — tambahkan `supervisiNextId`, `supervisiNextNama`,
`supervisiNextApproverNama`, `supervisiNextApprovedAt`, `catatanSupervisiNext`, dan
per tiket flag `isLanjutan`.

**Definisi tiket lanjutan (presisi, jangan pakai `status === "proses"`):** tiket yang
punya `TicketActivity` dengan `isTindakLanjutFlag = true` **dan**
`shiftKode = report.shiftKode`. Penanda itulah yang ditulis oleh handover/close
(`handover/route.ts:138-146`, `close/route.ts:112-120`) untuk tiket yang masih terbuka
saat shift ditutup. Memakai `status` saat ini akan salah karena tiket bisa sudah selesai
di shift berikutnya tetapi tetap merupakan lanjutan dari shift ini.

### 9.2 `app/(app)/supervisi/page.tsx` & `app/api/shift-reports/route.ts`

Teruskan `viewerId: session.sub` ke `listShiftReports`.

### 9.3 `components/supervisi/ShiftReportListClient.tsx`

- Kolom baru **Peran** (badge `Supervisi` / `Supervisi Selanjutnya` / `Utama + Selanjutnya`).
- Kolom status memakai `labelApproval`, bukan `status === "approved"` biner. Warna:
  `Sudah Diapprove` = success, `Menunggu Supervisi Selanjutnya`/`Menunggu Supervisi Utama`
  = info/biru (sudah jalan sebagian), `Menunggu Approval` = warning.
- `pendingCount` (baris 61) hitung berdasarkan peran viewer: laporan yang **peran viewer-nya
  belum approve**, bukan sekadar `status !== "approved"`.
- Tambah kolom/badge jumlah tiket lanjutan untuk laporan C/E.

### 9.4 `components/supervisi/ShiftReportDetailClient.tsx`

- `InfoRow` baru: **Supervisi**, **Supervisi Selanjutnya** (dengan status approve
  masing-masing + timestamp + catatan).
- Blok penjelas untuk peran `selanjutnya`: teks singkat "Tiket berikut merupakan tindak
  lanjut dari shift ini yang menjadi tanggung jawab pemantauan Anda."
- Badge **Tiket Lanjutan** pada baris tiket dengan `isLanjutan = true`; urutkan tiket
  lanjutan di atas.
- Label tombol approve mengikuti peran: `"Setujui sebagai Supervisi"` /
  `"Setujui sebagai Supervisi Selanjutnya"` / `"Setujui (Supervisi & Supervisi Selanjutnya)"`.
- Tombol disembunyikan bila peran viewer sudah approve.
- `canApprove` (prop, baris 34) diganti/dilengkapi `peran` dari server.

### 9.5 `components/daily-monitoring/DailyMonitoringClient.tsx`

Komponen sudah menerima `currentShift` (baris 45/60). Di **kedua** modal (serah terima
baris 424-440, tutup laporan baris 547-563):

- Render dropdown "Supervisi Selanjutnya" **hanya** bila `SHIFT_SUPERVISI_NEXT.has(currentShift)`.
- Saat tampil: `required`, opsi kosong berbunyi `— Pilih supervisi selanjutnya —`
  (bukan `— Tidak ada —`), helper text diganti
  `"Wajib untuk shift malam — supervisi ini ikut approve & tanda tangan laporan."`.
- Masukkan ke guard tombol: `canCloseShift` (baris 99) dan guard serah terima (baris 106)
  ikut mensyaratkan `hoSupervisiNext` bila shift C/E.
- Saat shift A/B/D: kirim `supervisiNextId: null` (server juga memaksa null).

## 10. Notifikasi Telegram

### 10.1 `lib/telegramNotif.ts`

Perluas `PendingReportNotif`:

```ts
  shiftKode: string;
  supervisiNext?: { nama?: string | null; telegramChatId?: string | null } | null;
  approvedAt?: Date | null;
  supervisiNextApprovedAt?: Date | null;
  supervisiNextId?: string | null;
  supervisiId?: string | null;
  /** Tiket yang ditandai tindak lanjut pada shift ini. */
  tiketLanjutan?: { noTiket: string; kodeAtm: string; namaAtm: string }[];
```

Fungsi baru `buildSupervisiNextMessage(report)`:

```
🌙 <b>Approval Supervisi Selanjutnya — mtr-Report</b>

Halo {nama}, laporan shift malam berikut menunggu persetujuan Anda:

📋 {shiftLabel}
📅 {tanggal}
👤 Petugas: {ownerNama}

🔁 <b>Tiket lanjutan yang menjadi pemantauan Anda ({n}):</b>
• {noTiket} — {kodeAtm} {namaAtm}
• …

Mohon approve di aplikasi agar laporan lengkap & TTD Anda terpasang.
<i>(Pengingat berulang tiap 1 jam, Senin–Jumat 07:00–18:00, sampai Anda approve)</i>
```

Bila `tiketLanjutan` kosong, ganti blok daftar dengan
`"🔁 Tidak ada tiket lanjutan pada shift ini."`. Batasi daftar maksimal **10** tiket,
sisanya `"… dan N tiket lainnya"` (batas panjang pesan Telegram 4096 karakter).

Ubah `sendReportReminder` menjadi mengirim ke **kedua** peran yang belum approve:

- kirim ke `supervisi.telegramChatId` bila `approvedAt == null`
- kirim ke `supervisiNext.telegramChatId` bila `butuhApprovalSupervisiNext(report)` dan
  `supervisiNextApprovedAt == null`
- **Dedupe berdasarkan `telegramChatId`.** Bila orang yang sama memegang dua peran, kirim
  **satu** pesan saja — pakai `buildSupervisiNextMessage` (supersetnya, memuat daftar tiket).
- Return jumlah pesan terkirim (`number`), bukan `boolean`. Ini **breaking change** pada
  kontrak `sendReportReminder` — sesuaikan `sendPendingReminders` (yang kini menambah
  `sent += hasil`, bukan `sent++`) dan **perbarui assertion boolean yang ada di
  `lib/__tests__/telegramNotif.test.ts`**.

### 10.2 `lib/telegramScheduler.ts`

- `fetchPendingReports`: `include` ditambah `supervisiNext: true`; ambil juga tiket
  lanjutan per laporan (query `ticket` dengan `activities: { some: { isTindakLanjutFlag: true, shiftKode: r.shiftKode } }`
  + `openShiftKode`/window hari yang sama seperti `getShiftReportDetail`).
  Perhatikan N+1 — kumpulkan dalam satu query lalu kelompokkan di memori.
- `notifyReportPending(reportId)`: sertakan relasi & tiket lanjutan yang sama.
- Gating jadwal (`bolehKirimNotif`, Sen–Jum 07:00–18:00 WIB) **tidak berubah**.

## 11. Test

Unit test (vitest, tanpa DB) — ikuti pola `lib/__tests__/shiftReport.test.ts`:

- **`lib/__tests__/shiftReportApproval.test.ts`** (baru)
  - `shiftPakaiSupervisiNext`: C/E true; A/B/D false
  - `butuhApprovalSupervisiNext`: shift A dengan `supervisiNextId` terisi (data lama) → **false**
  - `resolvePeranApproval`: utama / selanjutnya / keduanya (id sama) / null
  - `hitungStatusLaporan`: pending saat hanya satu approve; approved saat dua-duanya;
    approved saat shift A hanya butuh satu
  - `labelApproval`: seluruh 6 baris tabel §5
- **`lib/__tests__/shiftReport.test.ts`** (perluas)
  - `showSupervisiNext` true untuk C/E, false untuk A
  - nama supervisi selanjutnya tampil walau belum approve, TTD-nya `null`
  - TTD supervisi selanjutnya muncul setelah `supervisiNextApprovedAt` terisi
  - **regresi:** TTD supervisi UTAMA tetap tampil saat `approvedAt` terisi meski
    `supervisiNextApprovedAt` masih null (status laporan masih `pending`)
- **`lib/__tests__/telegramNotif.test.ts`** (perluas)
  - `buildSupervisiNextMessage` memuat daftar tiket lanjutan & memotong di 10 tiket
  - dedupe: satu chatId → satu pesan
  - peran yang sudah approve tidak dikirimi ulang

Verifikasi manual (butuh DB, tidak di-unit-test):

1. Serah terima shift **A** → dropdown Supervisi Selanjutnya tidak muncul; laporan Excel
   tetap 5 blok.
2. Serah terima shift **C** tanpa memilih Supervisi Selanjutnya → tombol disabled;
   panggilan API langsung → 400.
3. Serah terima shift **C** lengkap → menu Supervisi menampilkan laporan pada **dua**
   akun supervisi dengan badge peran berbeda.
4. Download laporan harian shift C sebelum approve → 6 blok, kolom L bernama tapi tanpa TTD.
5. Supervisi utama approve → status `Menunggu Supervisi Selanjutnya`; Excel: TTD utama
   muncul, TTD kolom L belum.
6. Supervisi selanjutnya approve → status `Sudah Diapprove`; Excel: TTD kolom L muncul,
   posisinya terpusat di kolom L dan tidak meluber ke M.
7. Kasus supervisi utama == supervisi selanjutnya → satu klik approve langsung
   `Sudah Diapprove`, dan hanya satu pesan Telegram terkirim.
8. Bandingkan hasil dengan sheet `31-07-2026 23-07` di `Laporan Juli.xlsx`.

## 12. Yang sengaja TIDAK diubah

- `lib/excelReportLengkap.ts`, `lib/weeklyReport.ts`, `lib/logbookExcel.ts` — tidak punya
  blok tanda tangan; di luar ruang lingkup.
- `buildShiftReportStatusMap` (`lib/shiftReportQueries.ts`) — tetap membaca
  `ShiftReport.status`. Karena `status` kini dual-gate, badge "Status Supervisi" di
  Daily/Weekly Monitoring otomatis baru hijau setelah kedua approval masuk. Tidak perlu
  perubahan kode di sana, tapi **sebutkan konsekuensinya** ke user saat selesai.
- Jendela sesi shift (`resolveReportDateWindow` / `useShiftSessionWindow`) — sudah benar
  untuk C/E, tidak disentuh.
- Aturan `openShiftKode` vs `shiftKode` untuk scope laporan — tidak disentuh.

## 13. Catatan operasional

- Pakai binary lokal, **bukan** `npx` (hook RTK dapat merusak `npx`):
  `./node_modules/.bin/prisma`, `./node_modules/.bin/tsc`, `./node_modules/.bin/next`,
  `./node_modules/.bin/vitest`.
- Untuk file besar (`lib/excelReport.ts` 852 baris, `DailyMonitoringClient.tsx` 749 baris),
  verifikasi hasil edit lewat `python3` dan redirect output `tsc`/`eslint` ke file —
  output RTK memampatkan/mengubah tampilan file kode besar.
- Urutan eksekusi yang disarankan: skema+migrasi → `shiftReportApproval.ts` + testnya →
  `shiftReport.ts` + test → `excelReport.ts` → `reportData.ts` → route handover/close →
  route approve → queries → UI → Telegram. Jalankan `vitest` + `tsc --noEmit` setelah
  tiap kelompok, laporkan hasilnya sebelum lanjut.
