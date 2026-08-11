# FITUR: Supervisi Bisa Tambah Kegiatan Penanganan Gangguan (Catatan Internal,
Tidak Ikut ke Download)

**Latar belakang:** Saat ini Supervisi sama sekali tidak bisa menambahkan
entri ke "Kegiatan Penanganan Gangguan" pada tiket — diblokir total oleh
`guardTicketMutation` (PRD §2: "Supervisi hanya boleh melihat"). User mau
Supervisi bisa menambahkan catatan pengawasan ke tiket yang jadi tanggung
jawabnya, TAPI catatan itu murni internal — begitu petugas (atau siapa pun)
men-download laporan apa pun (Harian, Weekly, Download Lengkap, Logbook per
User), baris kegiatan dari Supervisi harus di-skip, tidak ikut tercetak.

**KEPUTUSAN DESAIN (hasil konfirmasi user — dicatat di sini supaya tidak
diasumsikan ulang saat eksekusi):**
- Kegiatan dari Supervisi TETAP TAMPIL di layar (halaman detail tiket,
  Daily/Weekly Monitoring) — HANYA disembunyikan saat file hasil download
  di-generate (Excel Harian/Weekly, Download Lengkap, Logbook per User).
  Ditandai badge "Supervisi" di UI supaya jelas kenapa nanti tidak ikut ke
  file unduhan.
- Exclude ini berlaku untuk SEMUA yang mendownload — petugas, Supervisi,
  maupun Superadmin sendiri. Satu aturan konsisten, bukan per-role saat
  download.
- Supervisi hanya boleh menambah kegiatan pada tiket yang `supervisiId`-nya
  adalah dirinya sendiri (pola sama seperti endpoint approve tiket yang
  sudah ada) — BUKAN sembarang tiket.
- Supervisi boleh menambah kegiatan KAPAN SAJA, termasuk saat tiket sudah
  berstatus "Selesai" (beda dari petugas yang diblokir begitu status
  Selesai) — karena Supervisi sering menambah catatan justru saat
  meninjau tiket closed sebelum approve laporan shift.
- Supervisi TIDAK BISA mengedit atau menghapus kegiatan apa pun (miliknya
  sendiri maupun milik petugas) — tidak diminta, dan endpoint PATCH
  (`app/api/tickets/[id]/activities/[activityId]/route.ts`) SUDAH memblokir
  role `supervisi` secara eksplisit. JANGAN diubah.

**Investigasi yang sudah dilakukan (JANGAN diulang saat eksekusi):**
- Role di aplikasi ini cuma 3: `superadmin`, `user` (= "petugas" secara
  istilah UI, bukan role terpisah), `supervisi` (`prisma/schema.prisma:15-19`,
  `lib/roles.ts`).
- `TicketActivity` (`prisma/schema.prisma:225-245`) belum punya kolom
  penanda siapa/role apa yang menambahkan — cuma `userId` (relasi ke
  `User`). `isTindakLanjutFlag` yang sudah ada BUKAN pola exclude-dari-
  laporan — itu penanda baris sintetis "TINDAK LANJUT MONITORING
  SELANJUTNYA" yang di-generate otomatis saat close/handover, dipakai
  untuk menentukan batas segmen laporan per-shift
  (`lib/reportQuery.ts` — `resolveShiftReportSegment`/`stripClosingMarker`).
  Field baru `isSupervisiEntry` di bawah ini adalah mekanisme BARU dan
  TERPISAH dari `isTindakLanjutFlag`.
- `guardTicketMutation` (`lib/ticketGuard.ts:20-22`) memblokir SEMUA role
  `supervisi` di awal fungsi, sebelum sempat cek kepemilikan tiket — dipakai
  juga oleh endpoint activities POST yang ada sekarang. Untuk fitur ini,
  jalur Supervisi TIDAK memanggil `guardTicketMutation` sama sekali (lihat
  §1) — pakai pengecekan kepemilikan sendiri, mirror pola di
  `app/api/tickets/[id]/approve/route.ts:33-38` (`ticket.supervisiId !==
  session.sub` → 403 "Tiket ini bukan tanggung jawab supervisi Anda.").
- `Ticket.supervisiId` (`prisma/schema.prisma:197`) diisi saat serah
  terima/tutup shift — inilah "tiket yang jadi tanggung jawab Supervisi
  ini". Sudah dipakai persis dengan pola ini di `app/api/tickets/route.ts:54`
  (scoping GET list) dan `approve/route.ts:33`.
- **GAP PENTING yang ditemukan saat investigasi:** halaman `/daily-monitoring`
  di-blok RBAC khusus role `user` (`lib/rbac.ts:7` —
  `{ prefix: "/daily-monitoring", roles: ["user"] }`). Satu-satunya halaman
  yang bisa dipakai Supervisi untuk membuka detail SATU tiket adalah
  `/weekly-monitoring/[id]`. Tapi
  `app/(app)/weekly-monitoring/[id]/page.tsx` SAAT INI selalu mengirim
  `readOnly={session.role !== "superadmin"}` — artinya Supervisi SELALU
  dapat `readOnly=true` di sana, yang akan mematikan form tambah kegiatan
  walau backend & kondisi lain sudah mengizinkan. Ini WAJIB diubah (§5) agar
  fitur ini benar-benar bisa dipakai — jangan lupakan langkah ini.
- **Bug tersembunyi yang WAJIB ikut diperbaiki:** endpoint POST activities
  (`app/api/tickets/[id]/activities/route.ts:56-61`) menghitung
  `existingCount = await prisma.ticketActivity.count({ where: { ticketId: id } })`
  untuk mendeteksi "ini kegiatan ke-2" → mengunci `waktuResponInternal`
  (metrik SLA). Kalau tidak difilter, catatan Supervisi yang nyempil di
  antara kegiatan petugas akan MENGGESER hitungan ini dan merusak SLA
  waktu respon internal petugas. WAJIB tambah `isSupervisiEntry: false` di
  query count ini (lihat §1).
- `readOnly` di `TicketDetailClient.tsx` HANYA dipakai di 4 tempat:
  `canMutate` (baris 93), `canAddActivity` (113), `canEditActivity` (152),
  dan satu blok info Supervisi (554) — `canMutate`/`canEditActivity`
  sudah keras memblokir `role === "supervisi"` TERLEPAS dari nilai
  `readOnly`, jadi mengubah `readOnly` jadi `false` untuk Supervisi di
  Weekly Monitoring (§5) AMAN — tidak membuka mutasi lain (edit/close/
  hapus/reopen), hanya membuka jalur `canAddActivity` yang sudah dipagari
  ketat oleh kepemilikan `supervisiId` (§4).

---

## 1. `prisma/schema.prisma` — kolom baru `isSupervisiEntry`

Baris 225-245 (`model TicketActivity`), tambahkan SATU baris baru persis
setelah `isTindakLanjutFlag`:
```prisma
model TicketActivity {
  id               String    @id @default(cuid())
  ticketId         String    @map("ticket_id")
  userId           String    @map("user_id")
  shiftKode        ShiftKode @map("shift_kode")
  waktu            DateTime  @default(now())
  teks             String
  isTindakLanjutFlag Boolean @default(false) @map("is_tindak_lanjut_flag")
  isSupervisiEntry   Boolean @default(false) @map("is_supervisi_entry")
  createdAt        DateTime  @default(now()) @map("created_at")
  editedAt         DateTime? @map("edited_at")
  editedById       String?   @map("edited_by")

  ticket    Ticket                   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user      User                     @relation(fields: [userId], references: [id])
  editor    User?                    @relation("ActivityEditor", fields: [editedById], references: [id])
  revisions TicketActivityRevision[]

  @@index([ticketId])
  @@map("ticket_activities")
}
```
Lalu jalankan migrasi (jangan pakai `npx`, pakai binary lokal — lihat
catatan proyek soal `npx` yang kadang rusak lewat hook RTK):
```bash
./node_modules/.bin/prisma migrate dev --name add_is_supervisi_entry
```

---

## 2. `app/api/tickets/[id]/activities/route.ts` — restrukturisasi POST

Ganti SELURUH isi file jadi:
```ts
import { NextResponse } from "next/server";
import { ShiftKode, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { guardTicketMutation } from "@/lib/ticketGuard";

type Params = { params: Promise<{ id: string }> };

const SHIFTS = Object.values(ShiftKode) as string[];

/**
 * POST /api/tickets/[id]/activities — tambah entri kegiatan (PRD §4.B.3).
 * Append-only: timestamp & user/shift dicatat otomatis, tidak bisa
 * diedit/dihapus lewat endpoint ini (edit ada di PATCH terpisah, dan PATCH
 * itu sendiri memblokir role supervisi — jangan disentuh).
 *
 * Dua jalur:
 * - Supervisi: catatan pengawasan pada tiket yang jadi tanggung jawabnya
 *   (ticket.supervisiId). Boleh kapan saja termasuk tiket Selesai. Disimpan
 *   dengan isSupervisiEntry=true — otomatis tidak ikut ke laporan/download
 *   mana pun, tetap tampil di layar.
 * - Petugas / Super Admin: alur mutasi tiket biasa, tidak berubah selain
 *   penambahan filter isSupervisiEntry di hitungan waktu respon internal.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const teks = typeof body?.teks === "string" ? body.teks.trim() : "";
  if (!teks) {
    return NextResponse.json({ error: "Teks kegiatan wajib diisi." }, { status: 400 });
  }

  // --- Jalur Supervisi: catatan pengawasan, di luar guardTicketMutation ---
  if (session.role === "supervisi") {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: "Tiket tidak ditemukan." }, { status: 404 });
    }
    // Pola sama seperti app/api/tickets/[id]/approve/route.ts — Supervisi
    // hanya boleh bertindak pada tiket yang terikat ke dirinya.
    if (ticket.supervisiId !== session.sub) {
      return NextResponse.json(
        { error: "Tiket ini bukan tanggung jawab supervisi Anda." },
        { status: 403 }
      );
    }
    const activity = await prisma.ticketActivity.create({
      data: {
        ticketId: id,
        userId: session.sub,
        shiftKode: ticket.shiftKode,
        teks,
        isSupervisiEntry: true,
      },
      include: { user: { select: { nama: true } } },
    });
    return NextResponse.json({ item: activity }, { status: 201 });
  }

  // --- Jalur Petugas / Super Admin (alur lama) ---
  if (!SHIFTS.includes(session.shift)) {
    return NextResponse.json(
      { error: "Shift sesi tidak aktif. Pilih shift di Dashboard terlebih dahulu." },
      { status: 400 }
    );
  }
  const guard = await guardTicketMutation(session, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (guard.ticket.status === TicketStatus.selesai) {
    return NextResponse.json(
      { error: "Tiket sudah selesai — kegiatan tidak dapat ditambah." },
      { status: 409 }
    );
  }
  // Setelah serah terima, ticket.shiftKode berpindah ke shift berikutnya.
  // Hanya petugas shift aktif (atau Super Admin) yang boleh menambah kegiatan.
  if (session.role !== "superadmin" && guard.ticket.shiftKode !== session.shift) {
    return NextResponse.json(
      {
        error:
          "Tiket ini sudah diserahkan ke shift berikutnya. Kegiatan hanya bisa ditambahkan oleh petugas shift aktif.",
      },
      { status: 403 }
    );
  }

  // Hitung kegiatan yang sudah ada SEBELUM entri baru ini ditambahkan.
  // existingCount === 1 berarti entri baru ini adalah kegiatan KEDUA
  // (update pertama setelah open) → timestamp-nya menjadi waktu respon
  // internal. isSupervisiEntry: false WAJIB ada di sini — catatan
  // pengawasan Supervisi bukan bagian log resmi petugas, tidak boleh ikut
  // menggeser hitungan SLA ini.
  const existingCount = await prisma.ticketActivity.count({
    where: { ticketId: id, isSupervisiEntry: false },
  });

  const activity = await prisma.ticketActivity.create({
    data: {
      ticketId: id,
      userId: session.sub,
      shiftKode: session.shift as ShiftKode,
      teks,
    },
    include: { user: { select: { nama: true } } },
  });

  // Kunci waktu respon internal pada kegiatan ke-2 saja (sekali isi, immutable).
  if (existingCount === 1 && !guard.ticket.waktuResponInternal) {
    await prisma.ticket.update({
      where: { id },
      data: { waktuResponInternal: activity.waktu },
    });
  }

  return NextResponse.json({ item: activity }, { status: 201 });
}
```

---

## 3. `lib/ticketQueries.ts` — expose `isSupervisiEntry` ke UI

**a) Interface `TicketActivityItem` (baris 378-388):** tambah field baru
setelah `isTindakLanjutFlag`:
```ts
export interface TicketActivityItem {
  id: string;
  waktu: Date;
  teks: string;
  isTindakLanjutFlag: boolean;
  isSupervisiEntry: boolean;
  shiftKode: ShiftKode;
  userId: string;
  userNama: string;
  editedAt: Date | null;
  editedByNama: string | null;
}
```

**b) Mapper di `getTicketDetail` (baris 493-503):** tambah baris setelah
`isTindakLanjutFlag: a.isTindakLanjutFlag,`:
```ts
    activities: t.activities.map((a) => ({
      id: a.id,
      waktu: a.waktu,
      teks: a.teks,
      isTindakLanjutFlag: a.isTindakLanjutFlag,
      isSupervisiEntry: a.isSupervisiEntry,
      shiftKode: a.shiftKode,
      userId: a.userId,
      userNama: a.user.nama,
      editedAt: a.editedAt,
      editedByNama: a.editor?.nama ?? null,
    })),
```
Query Prisma di `getTicketDetail` (baris 442-448) TIDAK perlu diubah — sudah
pakai `include` (bukan `select`) jadi semua kolom scalar otomatis ikut
termasuk `isSupervisiEntry` setelah migrasi §1 jalan. Sengaja TIDAK difilter
`where: { isSupervisiEntry: false }` di sini — halaman detail tiket memang
harus tetap menampilkan kegiatan Supervisi (lihat KEPUTUSAN DESAIN).

---

## 4. `components/daily-monitoring/TicketDetailClient.tsx` — izinkan
   Supervisi tambah kegiatan + badge pembeda

**a) `canAddActivity` (baris 108-113):** ganti dari:
```ts
  /**
   * Hanya petugas shift aktif (atau Super Admin) yang boleh menambah kegiatan.
   * Owner shift sebelumnya tetap bisa lihat tiket, tetapi tidak menambah entri.
   */
  const canAddActivity =
    !readOnly && (role === "superadmin" || (canMutate && isShiftAktifPemegang));
```
menjadi:
```ts
  /**
   * Hanya petugas shift aktif (atau Super Admin) yang boleh menambah kegiatan.
   * Owner shift sebelumnya tetap bisa lihat tiket, tetapi tidak menambah entri.
   * Supervisi: boleh menambah kegiatan (catatan pengawasan) KHUSUS pada
   * tiket yang jadi tanggung jawabnya (ticket.supervisiId), terlepas dari
   * status tiket — beda dari petugas yang diblokir begitu tiket Selesai.
   */
  const isSupervisiPenanggungJawab =
    role === "supervisi" && ticket.supervisiId === currentUserId;
  const canAddActivity =
    !readOnly &&
    (role === "superadmin" ||
      (canMutate && isShiftAktifPemegang) ||
      isSupervisiPenanggungJawab);
```

**b) Kondisi render form (baris 642):** ganti dari:
```tsx
          {canMutate && !isSelesai && canAddActivity && (
```
menjadi:
```tsx
          {((canMutate && !isSelesai) || isSupervisiPenanggungJawab) &&
            canAddActivity && (
```
(Sesuaikan penutup JSX-nya — tutup kurung tambahan mengikuti baris
`)}` yang sudah ada di baris 660, tidak perlu ditambah baru karena cuma
menambah satu level tanda kurung pada kondisi `&&`, bukan nesting JSX baru.)
Baris 661 (blok warning "sudah diserahkan ke shift berikutnya") JANGAN
diubah — kondisinya (`canMutate && !isSelesai && !canAddActivity`) sudah
otomatis tidak pernah kena Supervisi karena `canMutate` sudah keras
`role !== "supervisi"`.

**c) Badge "Supervisi" di timeline (baris 705-707):** ganti dari:
```tsx
                      <Badge variant="neutral">
                        {SHIFT_NAMES[a.shiftKode] ?? `Shift ${a.shiftKode}`}
                      </Badge>
```
menjadi:
```tsx
                      <Badge variant="neutral">
                        {SHIFT_NAMES[a.shiftKode] ?? `Shift ${a.shiftKode}`}
                      </Badge>
                      {a.isSupervisiEntry && (
                        <Badge variant="primary">Supervisi</Badge>
                      )}
```

---

## 5. `app/(app)/weekly-monitoring/[id]/page.tsx` — buka `readOnly` untuk
   Supervisi (GAP kritis, lihat catatan investigasi di atas)

Ganti dari:
```tsx
      /**
       * Weekly Monitoring pada dasarnya menu tinjauan (read-only). Super Admin
       * dikecualikan agar punya satu tempat untuk override human error:
       * reopen tiket yang salah di-close, koreksi detail, dan hapus tiket.
       * Role lain (user & supervisi) tetap read-only penuh di menu ini —
       * mereka mengelola tiket lewat Daily Monitoring.
       */
      readOnly={session.role !== "superadmin"}
```
menjadi:
```tsx
      /**
       * Weekly Monitoring pada dasarnya menu tinjauan (read-only). Super Admin
       * dikecualikan agar punya satu tempat untuk override human error:
       * reopen tiket yang salah di-close, koreksi detail, dan hapus tiket.
       * Petugas (role user) tetap read-only penuh di menu ini — mereka
       * mengelola tiket lewat Daily Monitoring. Supervisi JUGA dikecualikan
       * (readOnly=false) supaya bisa menambah Kegiatan Penanganan Gangguan
       * di sini — ini satu-satunya halaman yang bisa dibuka Supervisi untuk
       * tiket per-item, karena /daily-monitoring dibatasi role "user" saja
       * (lib/rbac.ts). AMAN: canMutate/canEditActivity di
       * TicketDetailClient tetap keras memblokir role supervisi terlepas
       * dari readOnly — hanya canAddActivity yang terbuka, dan itu pun
       * dipagari kepemilikan ticket.supervisiId.
       */
      readOnly={session.role === "user"}
```

---

## 6. `lib/reportData.ts` — exclude dari Download Harian & Weekly

Baris 114-121 (`include` di `gatherReportData`), ganti baris `activities:`
dari:
```ts
      activities: { orderBy: { waktu: "asc" }, include: { user: { select: { nama: true } } } },
```
menjadi:
```ts
      activities: {
        where: { isSupervisiEntry: false },
        orderBy: { waktu: "asc" },
        include: { user: { select: { nama: true } } },
      },
```
Ini otomatis meng-cover Weekly Monitoring ZIP juga (`lib/weeklyReport.ts`
memanggil `gatherReportData` yang sama, tidak perlu disentuh terpisah).

---

## 7. `lib/reportLengkapQuery.ts` — exclude dari Download Laporan Lengkap

Baris 46-53 (`lengkapTicketInclude`), ganti dari:
```ts
export const lengkapTicketInclude = {
  atm: { select: { kodeAtm: true, namaAtm: true, cabang: true, alamat: true } },
  owner: { select: { nama: true } },
  activities: {
    orderBy: { waktu: "asc" },
    include: { user: { select: { nama: true } } },
  },
} satisfies Prisma.TicketInclude;
```
menjadi:
```ts
export const lengkapTicketInclude = {
  atm: { select: { kodeAtm: true, namaAtm: true, cabang: true, alamat: true } },
  owner: { select: { nama: true } },
  activities: {
    where: { isSupervisiEntry: false },
    orderBy: { waktu: "asc" },
    include: { user: { select: { nama: true } } },
  },
} satisfies Prisma.TicketInclude;
```

---

## 8. `lib/logbookData.ts` — exclude dari Logbook per User

Baris 92-97 (di dalam `select` query tiket, `gatherLogbookData`), ganti dari:
```ts
        activities: {
          orderBy: { waktu: "asc" },
          select: { waktu: true, teks: true, isTindakLanjutFlag: true },
        },
```
menjadi:
```ts
        activities: {
          where: { isSupervisiEntry: false },
          orderBy: { waktu: "asc" },
          select: { waktu: true, teks: true, isTindakLanjutFlag: true },
        },
```

---

## JANGAN LAKUKAN

- Jangan ubah `lib/ticketGuard.ts` — tetap memblokir Supervisi untuk SEMUA
  mutasi tiket lain (edit detail, close, hapus). Fitur ini cuma nambah
  jalur baru yang sama sekali tidak lewat helper ini.
- Jangan ubah endpoint PATCH
  (`app/api/tickets/[id]/activities/[activityId]/route.ts`) — Supervisi
  tetap TIDAK BISA edit/hapus kegiatan apa pun, termasuk kegiatannya
  sendiri. Sudah benar sebagaimana adanya.
- Jangan tambah filter `isSupervisiEntry` di `lib/ticketQueries.ts`
  (`getTicketDetail`) — halaman detail tiket WAJIB tetap menampilkan
  kegiatan Supervisi apa adanya.
- Jangan sentuh `lib/reportQuery.ts` (`resolveShiftReportSegment`,
  `stripClosingMarker`) — filter `isSupervisiEntry` sudah cukup dilakukan
  di level query Prisma (§6-8), jadi array yang diterima fungsi segmentasi
  ini sudah otomatis bersih, tidak perlu logika tambahan di sana.
- Jangan ubah `app/api/tickets/[id]/approve/route.ts` — dipakai hanya
  sebagai referensi pola, tidak perlu diubah.
- Jangan tambah pembatasan status (`isSelesai`) untuk form tambah kegiatan
  Supervisi — sudah diputuskan boleh kapan saja (lihat KEPUTUSAN DESAIN).

---

## VERIFIKASI SETELAH SELESAI

- `./node_modules/.bin/tsc --noEmit` (bukan `npx`).
- Migrasi Prisma jalan tanpa error, kolom `is_supervisi_entry` muncul di
  tabel `ticket_activities` dengan default `false`.
- Login sebagai Supervisi → buka `/weekly-monitoring` → klik salah satu
  tiket yang `supervisiId`-nya dirinya (biasanya tiket yang sudah pernah
  di-handover ke dia) → form "Kegiatan Penanganan Gangguan" muncul & bisa
  submit, baik saat tiket masih Proses MAUPUN sudah Selesai.
- Kegiatan yang baru ditambahkan Supervisi muncul di timeline dengan badge
  "Supervisi", TIDAK bisa di-edit (tombol Edit tidak muncul untuk role ini
  sama sekali, konsisten dengan `canEditActivity`).
- Login sebagai Supervisi lain (bukan penanggung jawab tiket tsb) → buka
  tiket yang sama lewat `/weekly-monitoring/[id]` → form tambah kegiatan
  TIDAK muncul (langsung POST via curl/devtools ke endpoint harus balas
  403 "Tiket ini bukan tanggung jawab supervisi Anda.").
- Login sebagai petugas (`user`) → buka tiket yang sama → kegiatan dari
  Supervisi tetap KELIHATAN di timeline (dengan badge Supervisi), tapi
  petugas TIDAK bisa menambah lewat form Supervisi (tetap pakai form biasa
  seperti sebelumnya, tidak berubah).
- Download Laporan Harian (Form OPS-001) untuk tanggal & shift yang tiketnya
  punya kegiatan dari Supervisi → baris kegiatan Supervisi TIDAK muncul di
  Excel, kegiatan petugas lain di tiket yang sama tetap lengkap & urut
  waktu benar (cek juga baris "TINDAK LANJUT MONITORING SELANJUTNYA" kalau
  ada di tiket lanjutan — harus tetap muncul, cuma kegiatan Supervisi yang
  hilang).
- Download Weekly Monitoring (ZIP) untuk rentang yang sama → cek satu file
  di dalamnya, hasilnya konsisten dengan Download Harian di atas.
- Download Laporan Lengkap untuk rentang tanggal yang sama → baris kegiatan
  Supervisi tidak ikut ke teks gabungan kegiatan tiket tsb.
- Download Logbook per User milik petugas yang tiketnya disentuh Supervisi
  → baris kegiatan Supervisi tidak ikut ke teks gabungan.
- Cek regresi SLA: buat tiket baru sebagai petugas → tambah kegiatan
  Supervisi (kalau tiket itu sudah punya supervisiId) SEBELUM petugas
  menambah kegiatan kedua → lalu petugas tambah kegiatan kedua →
  `waktuResponInternal` harus terkunci pada kegiatan kedua PETUGAS (bukan
  ikut kegiatan Supervisi yang nyempil).
- Cek fitur lama tidak regresi: Super Admin & petugas tetap bisa
  tambah/edit kegiatan seperti biasa di Daily & Weekly Monitoring; endpoint
  approve tiket Supervisi tetap jalan normal.
