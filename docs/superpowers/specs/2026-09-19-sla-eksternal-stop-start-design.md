# Stop/Start SLA Eksternal — Design Spec

**Status:** Approved by user in brainstorming session, ready for implementation planning.
**Date:** 2026-09-19

## Latar Belakang

Sejak fitur SLA Internal/Eksternal (Lampiran IV PKS ARTAJASA–Bank Nagari)
berjalan, tanggung jawab SLA berpindah dari Internal ke Eksternal **satu
kali, permanen**, pada saat `Ticket.waktuLaporVendor` pertama kali tercatat
(auto-capture saat "No Tiket Vendor" diisi). Dari titik itu sampai tiket
ditutup, seluruh durasi dihitung sebagai downtime Eksternal (lihat
`downtimeMenit()` di `lib/slaMonitoring.ts:214-238`, hasil kerja sesi
sebelumnya — Internal berhenti persis di `waktuLaporVendor`, Eksternal
lanjut dari situ sampai `waktuSelesai`).

Masalah nyata di lapangan: kadang di tengah insiden yang sedang ditangani
vendor, PIC vendor yang bersangkutan **tidak bisa dihubungi/eksekusi**.
Petugas perlu bisa "mengambil alih" sementara — menghentikan hitungan
Eksternal, kembali ke Internal — lalu **melanjutkan lagi** ke Eksternal
begitu vendor bisa lanjut. Ini bisa terjadi **berkali-kali** dalam satu
insiden yang sama.

## Keputusan Desain (dikonfirmasi user selama brainstorming — jangan
diasumsikan ulang saat eksekusi)

1. Stop → Start bisa terjadi **berkali-kali** pada tiket yang sama (bukan
   toggle sekali pakai).
2. "Start" (melanjutkan Eksternal) **tidak** perlu No Tiket Vendor baru —
   nomor vendor yang sama dipakai terus untuk seluruh insiden. Cuma jam
   mulai/berhentinya yang berubah-ubah.
3. Fitur ini **hanya berlaku untuk tiket status "Proses"**. Tiket
   "Selesai" durasinya sudah final; koreksi pasca-selesai tetap lewat
   jalur Super Admin yang sudah ada (`app/api/tickets/[id]/route.ts` PATCH
   khusus superadmin), TIDAK lewat fitur ini.
4. `catatan` (alasan) saat "Stop" **opsional**, bukan wajib. "Start" tidak
   punya input tambahan sama sekali.
5. Waktu stop/start **selalu `now()`** (waktu server saat tombol ditekan)
   — tidak ada input jam manual untuk aksi ini (beda dari `waktuLaporVendor`
   pertama yang boleh dikoreksi manual saat Open Tiket/edit).
6. Pendekatan data: **tabel riwayat baru** (`TicketSlaEpisode`), BUKAN
   akumulator total tanpa jejak — supaya ada bukti tertulis kapan & kenapa
   SLA dipindah, karena ini berdampak ke restitusi (denda kontraktual ke
   vendor).

## Model Data

Tabel baru, **append-only** (pola sama seperti `TicketActivity` —
`prisma/schema.prisma:294-317` — tidak bisa diedit/dihapus, cuma nambah
baris). Sengaja **tanpa kolom `selesai`**: akhir satu episode = mulai-nya
episode berikutnya (atau `waktuSelesai` tiket kalau itu episode terakhir).
Ini menghindari transaksi update+insert setiap stop/start, dan meniadakan
kemungkinan data episode yang "selesai"-nya lupa di-set.

```prisma
enum SlaEpisodeBasis {
  internal
  eksternal
}

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

Tambahan di `model Ticket` (`prisma/schema.prisma:276-285`, blok relasi):
`slaEpisodes TicketSlaEpisode[]`.

Tambahan di `model User` (`prisma/schema.prisma:128-143`, blok relasi):
`slaEpisodesDibuat TicketSlaEpisode[]` (relasi tak-bernama, karena cuma
satu FK dari `TicketSlaEpisode` ke `User` — pola sama seperti
`User.activities` / `TicketActivity.user`).

**Cara baca riwayat lengkap satu tiket** (dari lama ke baru):
`waktuOpen` (Internal) → `waktuLaporVendor` (ganti ke Eksternal, kalau
ada) → `episode[0].mulai` (ganti sesuai `episode[0].basis`) →
`episode[1].mulai` → ... → `waktuSelesai`. Kalau tabel `TicketSlaEpisode`
kosong untuk suatu tiket, hasilnya identik dengan rumus yang sudah jalan
sekarang — **tiket lama/tanpa fitur ini tidak berubah angkanya**.

## Mesin Hitung (`lib/slaMonitoring.ts`)

`downtimeMenit(t, basis)` (baris 214-238 saat ini, hanya tahu 1 titik
potong) diganti fungsi yang menyusun **daftar breakpoint terurut**
(`waktuOpen`+internal, `waktuLaporVendor`+eksternal, lalu tiap
`slaEpisodes[i].mulai`+`slaEpisodes[i].basis`), lalu menjumlahkan menit
per label di sepanjang garis waktu itu (akhir tiap segmen = mulai
breakpoint berikutnya, atau `waktuSelesai` untuk segmen terakhir).

Kasus tanpa `waktuLaporVendor` sama sekali (tidak pernah lapor vendor) —
tidak berubah, tetap Internal penuh, dan tombol stop/start tidak pernah
muncul di UI untuk tiket seperti ini (lihat §UI). Kasus
`adaBasisEksternal(t)` bernilai false (vendor dilapor setelah tiket
ditutup) — tidak berubah juga, seluruh durasi tetap Internal, episodes
diabaikan (seharusnya memang tidak pernah ada untuk kasus ini karena UI
tidak akan mengizinkan stop/start tanpa `waktuLaporVendor` yang valid).

**Dampak ke 4 fungsi existing** (`getLowestSla`, `getSlaSummary`,
`getProblemReport`, `getSlaDrilldownTickets`): masing-masing perlu
menambah `include`/`select` relasi `slaEpisodes` (urut `mulai` ascending)
di query Prisma-nya. **Signature fungsi publik tidak berubah** — konsumen
di luar `lib/slaMonitoring.ts` (route API, halaman) tidak perlu disentuh
sama sekali.

## Endpoint API

Dua route baru, ikut pola dedicated-action yang sudah ada
(`app/api/tickets/[id]/close/route.ts`, `/approve/route.ts`,
`/reopen/route.ts` — guard via `guardTicketMutation` lalu validasi
tambahan spesifik aksi):

- `POST /api/tickets/[id]/sla-eksternal/stop` — body `{ catatan?: string }`
- `POST /api/tickets/[id]/sla-eksternal/start` — tanpa body

**Validasi (selain `guardTicketMutation` yang sudah ada):**
1. `ticket.status !== "proses"` → 409 "Hanya tiket berstatus Proses yang
   bisa diubah."
2. `!ticket.waktuLaporVendor` → 409 "Tiket ini belum pernah lapor ke
   vendor."
3. State machine — ambil `TicketSlaEpisode` PALING TERAKHIR (`orderBy:
   {mulai: "desc"}, take: 1`) milik tiket ini:
   - Tidak ada baris sama sekali → status saat ini **Eksternal** (keadaan
     sejak `waktuLaporVendor` pertama terisi, belum pernah di-stop).
   - Baris terakhir `basis: "internal"` → status saat ini **Internal**
     (sedang di-pause).
   - Baris terakhir `basis: "eksternal"` → status saat ini **Eksternal**.
   - `/stop` valid HANYA kalau status saat ini Eksternal (else 409 "SLA
     sudah dalam status Internal."); `/start` valid HANYA kalau status
     saat ini Internal (else 409 "SLA sudah dalam status Eksternal.").
4. Insert satu baris `TicketSlaEpisode` baru: `/stop` →
   `{basis: "internal", mulai: now(), catatan}`; `/start` →
   `{basis: "eksternal", mulai: now()}`. `dibuatOlehId = session.sub`.

## UI (`components/daily-monitoring/TicketDetailClient.tsx`)

Muncul HANYA kalau `status === "proses"` DAN `waktuLaporVendor` terisi.

- Indikator status ringkas di dekat field "No Tiket Vendor", pakai
  komponen `Badge` yang sudah dipakai di file yang sama untuk status
  tiket (`variant="success"`/`"warning"`, bukan emoji — ikut konvensi
  yang sudah ada, bukan pola baru): `Eksternal — Berjalan sejak HH.mm`
  (`success`) atau `Internal — Dihentikan Sementara sejak HH.mm`
  (`warning`).
- Satu tombol yang label & aksinya mengikuti status terkini — "Stop SLA
  Eksternal" / "Start SLA Eksternal" — pola modal-konfirmasi sama seperti
  tombol Tutup/Buka Ulang Tiket yang sudah ada (`confirmClose`/
  `confirmReopen`, baris ~424-462). Modal "Stop" punya textarea catatan
  opsional; modal "Start" langsung konfirmasi.
- Daftar riwayat kecil di bawahnya (basis, jam mulai, catatan bila ada)
  supaya petugas & supervisi bisa lihat kronologi lengkap, bukan cuma
  status terkini.

## Testing

- Unit test mesin hitung multi-episode di
  `lib/__tests__/slaMonitoring.test.ts`: fixture dengan 2-3 episode
  bergantian, pastikan total Internal + total Eksternal = durasi penuh
  tiket (invarian yang sama seperti test "sekuensial" yang sudah ada dari
  sesi sebelumnya, diperluas ke >1 episode). Pastikan juga tiket TANPA
  episode sama sekali hasilnya identik dengan sebelum fitur ini ada
  (regresi).
- Test endpoint stop/start, mirror pola
  `app/api/tickets/__tests__/patchWaktuLaporVendor.test.ts` (mock Prisma):
  state machine (stop saat sudah internal → 409, start saat sudah
  eksternal → 409, stop/start di tiket "selesai" → 409, stop/start di
  tiket tanpa `waktuLaporVendor` → 409), dan kasus normal (insert baris
  baru dengan `basis`/`dibuatOlehId` benar).

## Di Luar Scope (sengaja tidak dikerjakan sekarang)

- Koreksi/edit/hapus baris `TicketSlaEpisode` yang sudah tercatat
  (append-only, sama seperti `TicketActivity` — kalau salah pencet,
  tinggal stop/start lagi untuk "membatalkan").
- Input jam manual untuk stop/start (selalu `now()`).
- Perhitungan ulang Restitusi secara real-time saat stop/start ditekan —
  Restitusi tetap dihitung dari rekap periode seperti biasa (dashboard
  Monitoring SLA), bukan notifikasi seketika saat SLA berpindah.
- Perubahan apa pun ke alur tiket "Selesai" atau jalur override Super
  Admin yang sudah ada.
