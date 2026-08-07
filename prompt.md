# FITUR: Notifikasi Telegram ke Superadmin (monitoring petugas online,
tiket dibuat, approve supervisi)

**Latar belakang:** Superadmin mau daftarkan bot Telegram ke nomor
pribadinya untuk memantau aplikasi secara real-time tanpa buka dashboard
terus-menerus: siapa petugas yang sedang online (shift aktif), tiket apa
saja yang baru dibuka (No Tiket + ATM-nya), dan kapan supervisi approve
laporan shift. Ini KHUSUS notifikasi ke Superadmin — tidak mengubah alur
notif Supervisi (Fase 2-4) yang sudah ada.

**KEPUTUSAN DESAIN (hasil konfirmasi user — dicatat di sini supaya tidak
diasumsikan ulang saat eksekusi):**
- "Online" = DUA mekanisme: (1) notif otomatis real-time setiap kali
  petugas MULAI shift baru, DAN (2) command bot `/online` yang bisa
  diketik admin kapan saja untuk lihat daftar terkini. TIDAK ada notif
  saat petugas SELESAI shift (serah terima/tutup) — di luar scope.
- Notif tiket dibuat berlaku untuk SEMUA tiket (kategori/jenis gangguan
  apa pun) yang berhasil dibuat lewat Open Tiket.
- Notif approve shift mencakup approval peran `utama` MAUPUN
  `selanjutnya` (shift malam C/E) — DAN kasus `keduanya` (satu orang
  jadi supervisi utama & selanjutnya sekaligus, lihat
  `lib/shiftReportApproval.ts:40`).
- Penerima: SEMUA akun role `superadmin` yang sudah isi Chat ID sendiri
  (bukan cuma 1 akun hardcoded) — reuse pola field `telegramChatId` yang
  sudah ada di tabel `users`, tapi field itu SAAT INI sengaja diblokir
  untuk role `superadmin` (lihat GAP di bawah). Field itu perlu dibuka
  untuk role ini juga.
- **PENTING — jangan disamakan dengan fitur reminder approval yang sudah
  ada:** notif reminder approval Supervisi (Fase 4,
  `bolehKirimNotif()` di `lib/telegramNotif.ts:52`) sengaja dibatasi
  Senin–Jumat 07:00–18:00 WIB supaya tidak mengganggu di luar jam kerja.
  KETIGA notif baru di fitur ini TIDAK BOLEH pakai gate itu — ATM
  monitoring berjalan 24/7 termasuk shift malam (C: 23:00–07:00, E:
  19:00–07:00), justru di situ notif real-time paling dibutuhkan karena
  admin tidak sedang buka dashboard. Kirim langsung kapan pun terjadi.
- Tidak ada migrasi Prisma baru. Semua reuse kolom yang sudah ada:
  `telegramChatId`, `currentShift`, `shiftStartedAt` di tabel `users`.

**Investigasi yang sudah dilakukan (JANGAN diulang saat eksekusi):**
- `lib/telegram.ts` (`sendTelegramMessage`), `lib/telegramNotif.ts`
  (pola message builder pure), `lib/telegramScheduler.ts` (pola DB glue
  terpisah dari builder pure), `lib/telegramPolling.ts` (bot polling
  `/start` & `/id`, jalan otomatis lewat `instrumentation.ts` — TIDAK
  perlu register service baru, tinggal extend `processTelegramUpdates`).
- `SessionPayload` (`lib/jwt.ts:9-24`) SUDAH punya `sub`, `nama`, `role`,
  `shift`, `shiftStartedAt` — jadi notif tiket dibuat & mulai shift TIDAK
  perlu query DB tambahan untuk nama/shift petugas, cukup dari `session`.
- `shiftSessionStart()` (`lib/shift.ts:144-159`) mengembalikan
  `{ startedAt, lanjutan }` — `lanjutan: true` berarti sesi shift yang
  SAMA dipertahankan (resume/refresh), BUKAN mulai baru. Notif "mulai
  shift" WAJIB di-gate `lanjutan === false`, supaya tidak spam tiap kali
  petugas reload halaman Dashboard.
- `lib/dashboardQueries.ts:267-278` — query member Dashboard Super Admin
  sudah pakai pola `role: { in: [Role.user, Role.supervisi] }`,
  `isAktif: true`, select `currentShift`. Query `/online` command
  MIRROR pola ini persis (termasuk cakupan role: user & supervisi, biar
  konsisten dengan tabel Member yang sudah ada di UI).
- `PeranApproval` (`lib/shiftReportApproval.ts:40`) = `"utama" |
  "selanjutnya" | "keduanya" | null`. Endpoint approve
  (`app/api/shift-reports/[id]/approve/route.ts`) sudah resolve `peran`
  sebelum transaksi — dipakai langsung, tidak perlu re-derive.
- `app/api/telegram/test/route.ts` (tombol "Kirim Notif Test" di
  Manajemen Akun) TIDAK PERLU diubah — sudah generik, terima `chatId`
  apa pun dari body, cukup dipanggil dengan Chat ID superadmin begitu
  field-nya terbuka di UI.

---

## 1. `app/api/users/[id]/route.ts` — buka `telegramChatId` untuk role
   `superadmin` (GAP, harus dibenerin dulu sebelum langkah lain jalan)

Baris 84-95 saat ini:
```ts
// Integrasi Telegram (Fase 2) — hanya Super Admin (route ini sudah dibatasi)
// dan hanya untuk akun non-superadmin. String kosong → null (hapus setelan).
if (body?.telegramChatId !== undefined) {
  if (target.role === Role.superadmin) {
    return NextResponse.json(
      { error: "Chat ID Telegram tidak berlaku untuk akun Super Admin." },
      { status: 400 }
    );
  }
  const chatId = cleanStr(body.telegramChatId);
  data.telegramChatId = chatId || null;
}
```
Ubah jadi (hapus gate penolakan superadmin — field ini sekarang berlaku
untuk SEMUA role):
```ts
// Integrasi Telegram — Chat ID berlaku untuk semua role (Fase 2:
// Supervisi approval; fitur baru: notif monitoring Superadmin).
// String kosong → null (hapus setelan).
if (body?.telegramChatId !== undefined) {
  const chatId = cleanStr(body.telegramChatId);
  data.telegramChatId = chatId || null;
}
```
Komentar di baris 36 (deklarasi `data.telegramNomor`, baris 96-99) tidak
perlu diubah — field itu memang sudah tidak dibatasi role.

---

## 2. `components/manajemen-akun/ManajemenAkunClient.tsx` — buka UI
   Telegram untuk role `superadmin`

**a) `openEdit` (baris 113-129):** JANGAN ubah baris 119
(`role: u.role === "superadmin" ? "user" : u.role,`) — itu tetap perlu
supaya dropdown Peran yang disabled tidak error. TAPI ini artinya
`form.role` TIDAK PERNAH bernilai `"superadmin"` walau sedang edit akun
superadmin — kondisi tampil-blok Telegram di bawah harus cek
`editing?.role`, BUKAN `form.role`, untuk kasus superadmin.

**b) Blok form Telegram (baris 519-547):** ubah kondisi baris 520 dari:
```tsx
{form.role === "supervisi" && (
```
menjadi:
```tsx
{(form.role === "supervisi" || editing?.role === "superadmin") && (
```
Sesuaikan juga teks komentar baris 519 (`// Integrasi Telegram (Fase
2) — hanya untuk akun Supervisi.`) dan copy penjelasan baris 525-529
(`Cara dapat Chat ID: Supervisi buka Telegram...`) — ganti "Supervisi"
jadi kalimat yang mencakup kedua kasus, mis.:
```tsx
<p className="text-xs text-gray-500 leading-relaxed">
  Cara dapat Chat ID: buka Telegram → cari bot → klik Start → kirim{" "}
  <code className="font-mono">/id</code> → bot balas Chat ID. Masukkan
  angka itu ke field di bawah.
</p>
```

**c) Badge kolom tabel (baris 372-382):** ubah kondisi baris 373 dari:
```tsx
{u.role === "supervisi" ? (
```
menjadi:
```tsx
{u.role === "supervisi" || u.role === "superadmin" ? (
```

**d) `submit()` (baris 168-244):** baris 186 saat ini:
```tsx
// Field Telegram hanya relevan untuk akun Supervisi.
...(!isSuper && form.role === "supervisi"
  ? {
      telegramChatId: form.telegramChatId,
      telegramNomor: form.telegramNomor,
    }
  : {}),
```
`isSuper` (baris 176, `editing?.role === "superadmin"`) dipakai di sini
untuk MENGECUALIKAN field Telegram — itu sisa dari pembatasan lama, harus
dibalik jadi ikut terkirim KHUSUS untuk field Telegram walau `isSuper`
true (field lain seperti `username`/`role`/`isAktif` TETAP harus
dikecualikan untuk superadmin, jangan diubah). Ganti jadi:
```tsx
// Field Telegram: relevan untuk Supervisi (approval) & Superadmin
// (monitoring). isSuper sengaja TIDAK ikut exclude di sini — field lain
// (username/role/isAktif) tetap dikecualikan lewat spread di atas.
...(form.role === "supervisi" || isSuper
  ? {
      telegramChatId: form.telegramChatId,
      telegramNomor: form.telegramNomor,
    }
  : {}),
```

---

## 3. `lib/telegramAdminNotif.ts` (baru) — pure message builders

Niru gaya `lib/telegramNotif.ts` (fungsi murni, tanpa akses DB, mudah
di-unit-test). Isi:

```ts
/**
 * Integrasi Telegram — notif monitoring Superadmin (petugas online, tiket
 * dibuat, approve supervisi). Helper murni (tanpa akses DB); lapisan DB ada
 * di `telegramAdminScheduler.ts` — pola sama seperti telegramNotif.ts vs
 * telegramScheduler.ts.
 *
 * BEDA PENTING dari telegramNotif.ts: notif di sini TIDAK di-gate jadwal
 * Senin-Jumat 07:00-18:00 (bolehKirimNotif) — monitoring ATM berjalan 24/7
 * termasuk shift malam, jadi selalu dikirim langsung saat kejadian.
 */
import type { PeranApprovalAktif } from "./shiftReportApproval";

export interface TicketCreatedNotif {
  noTiket: string;
  kodeAtm: string;
  namaAtm: string;
  petugasNama: string;
  shiftLabel: string;
  jenisGangguan: string;
}

export function buildTicketCreatedMessage(data: TicketCreatedNotif): string {
  return (
    `🎫 <b>Tiket Baru Dibuka</b>\n\n` +
    `📋 No Tiket: <b>${data.noTiket}</b>\n` +
    `🏧 ATM: ${data.kodeAtm} — ${data.namaAtm}\n` +
    `⚠️ Jenis Gangguan: ${data.jenisGangguan}\n` +
    `👤 Petugas: ${data.petugasNama}\n` +
    `🕐 Shift: ${data.shiftLabel}`
  );
}

export interface ShiftStartedNotif {
  petugasNama: string;
  shiftLabel: string;
  startedAt: Date;
}

export function buildShiftStartedMessage(data: ShiftStartedNotif): string {
  const jam = data.startedAt.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    `🟢 <b>Petugas Mulai Shift</b>\n\n` +
    `👤 ${data.petugasNama}\n` +
    `🕐 ${data.shiftLabel}\n` +
    `⏰ Mulai jam ${jam} WIB`
  );
}

export interface ReportApprovedNotif {
  shiftLabel: string;
  tanggal: Date | string;
  petugasNama: string;
  supervisiNama: string;
  peran: PeranApprovalAktif;
}

const PERAN_LABEL: Record<PeranApprovalAktif, string> = {
  utama: "Supervisi",
  selanjutnya: "Supervisi Selanjutnya",
  keduanya: "Supervisi Utama & Selanjutnya",
};

export function buildReportApprovedMessage(data: ReportApprovedNotif): string {
  const tanggal = new Date(data.tanggal).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    `✅ <b>Laporan Shift Disetujui</b>\n\n` +
    `📋 ${data.shiftLabel}\n` +
    `📅 ${tanggal}\n` +
    `👤 Petugas: ${data.petugasNama}\n` +
    `🖊️ Disetujui oleh: ${data.supervisiNama} (${PERAN_LABEL[data.peran]})`
  );
}

export interface OnlineOfficer {
  nama: string;
  shiftLabel: string;
}

export function buildOnlineListMessage(officers: OnlineOfficer[]): string {
  if (officers.length === 0) {
    return `👥 <b>Petugas Online Saat Ini</b>\n\nTidak ada petugas dengan shift aktif.`;
  }
  const daftar = officers
    .map((o) => `• ${o.nama} — ${o.shiftLabel}`)
    .join("\n");
  return `👥 <b>Petugas Online Saat Ini (${officers.length})</b>\n\n${daftar}`;
}

/** Perintah bot untuk melihat daftar petugas online (mirip isChatIdCommand
 * di telegramPolling.ts — toleran spasi/besar-kecil/suffix @NamaBot). */
export function isOnlineCommand(text: string | null | undefined): boolean {
  if (!text) return false;
  const cmd = text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  return cmd === "/online";
}
```

---

## 4. `lib/telegramAdminScheduler.ts` (baru) — DB glue

Niru gaya `lib/telegramScheduler.ts` (query Prisma + panggil builder pure
dari langkah 3). File ini TIDAK perlu unit test langsung — konsisten
dengan `telegramScheduler.ts` yang juga tidak ada test file-nya (lihat
`lib/__tests__/` — cuma ada test untuk `telegramNotif.ts` &
`telegramPolling.ts`, dua modul pure).

```ts
/**
 * Integrasi Telegram — lapisan DB untuk notif monitoring Superadmin.
 * Memakai builder murni dari `telegramAdminNotif.ts`. TIDAK memakai
 * bolehKirimNotif() — lihat catatan di telegramAdminNotif.ts kenapa.
 */
import { prisma } from "./prisma";
import { Role } from "@prisma/client";
import { sendTelegramMessage } from "./telegram";
import {
  buildTicketCreatedMessage,
  buildShiftStartedMessage,
  buildReportApprovedMessage,
  buildOnlineListMessage,
  type TicketCreatedNotif,
  type ShiftStartedNotif,
  type ReportApprovedNotif,
} from "./telegramAdminNotif";

/** Chat ID semua akun Superadmin aktif yang sudah isi Chat ID Telegram. */
export async function getSuperadminChatIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: Role.superadmin, isAktif: true, telegramChatId: { not: null } },
    select: { telegramChatId: true },
  });
  return rows.map((r) => r.telegramChatId as string);
}

/** Kirim satu pesan ke semua Chat ID Superadmin. Tidak melempar error. */
export async function broadcastToAdmins(message: string): Promise<number> {
  const chatIds = await getSuperadminChatIds();
  let sent = 0;
  for (const chatId of chatIds) {
    const res = await sendTelegramMessage(chatId, message);
    if (res.ok) sent++;
  }
  return sent;
}

/** Notif tiket baru dibuka. Tidak melempar error. */
export async function notifyTicketCreated(data: TicketCreatedNotif): Promise<void> {
  try {
    await broadcastToAdmins(buildTicketCreatedMessage(data));
  } catch (err) {
    console.error("[telegram] Gagal kirim notif tiket dibuat:", err);
  }
}

/** Notif petugas mulai shift baru (bukan resume). Tidak melempar error. */
export async function notifyShiftStarted(data: ShiftStartedNotif): Promise<void> {
  try {
    await broadcastToAdmins(buildShiftStartedMessage(data));
  } catch (err) {
    console.error("[telegram] Gagal kirim notif mulai shift:", err);
  }
}

/** Notif laporan shift disetujui supervisi. Tidak melempar error. */
export async function notifyReportApproved(data: ReportApprovedNotif): Promise<void> {
  try {
    await broadcastToAdmins(buildReportApprovedMessage(data));
  } catch (err) {
    console.error("[telegram] Gagal kirim notif approve shift:", err);
  }
}

/** Daftar petugas (role user & supervisi) dengan shift aktif saat ini —
 * mirror query member Dashboard Super Admin (lib/dashboardQueries.ts). */
export async function getOnlineOfficers(): Promise<
  { nama: string; shiftLabel: string }[]
> {
  const { SHIFT_LABELS } = await import("./constants");
  const rows = await prisma.user.findMany({
    where: {
      isAktif: true,
      role: { in: [Role.user, Role.supervisi] },
      currentShift: { not: null },
    },
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: { nama: true, currentShift: true },
  });
  return rows.map((r) => ({
    nama: r.nama,
    shiftLabel: SHIFT_LABELS[r.currentShift as string] ?? String(r.currentShift),
  }));
}

/** Balasan command /online — dipanggil dari telegramPolling.ts. */
export async function buildOnlineReply(): Promise<string> {
  return buildOnlineListMessage(await getOnlineOfficers());
}

/** True bila chatId terdaftar sebagai Chat ID salah satu akun Superadmin
 * aktif — dipakai membatasi command /online agar tidak bisa dipakai
 * sembarang orang yang chat ke bot. */
export async function isRegisteredAdminChatId(
  chatId: string | number
): Promise<boolean> {
  const ids = await getSuperadminChatIds();
  return ids.includes(String(chatId));
}
```

Catatan import: `SHIFT_LABELS` di-import dinamis (`await import`) di
dalam fungsi supaya tidak menambah dependency berat di top-level file ini
— TAPI kalau saat eksekusi ternyata `lib/constants.ts` sudah ringan
dependency-nya (cek isinya dulu), boleh dipakai `import` statis biasa di
atas file, lebih idiomatis dan konsisten dengan file lain di project ini.
Sesuaikan mana yang lebih cocok, ini bukan keputusan kaku.

---

## 5. `lib/telegramPolling.ts` — tambah command `/online`

Baris 26 saat ini:
```ts
const COMMANDS = new Set(["/start", "/id"]);
```
Biarkan (tetap dipakai `isChatIdCommand` untuk `/start` & `/id`).

Ubah `processTelegramUpdates` (baris 74-89) supaya juga menangani
`/online`, DIBATASI hanya untuk Chat ID yang terdaftar sebagai
Superadmin. Import baru di atas file:
```ts
import { isOnlineCommand, buildOnlineReply, isRegisteredAdminChatId } from "./telegramAdminScheduler";
```
Ubah isi loop (baris 79-87) dari:
```ts
for (const update of updates) {
  if (typeof update.update_id === "number") {
    next = Math.max(next, update.update_id + 1);
  }
  const chatId = update.message?.chat?.id;
  if (chatId != null && isChatIdCommand(update.message?.text)) {
    await sendTelegramMessage(chatId, buildChatIdReply(chatId));
  }
}
```
menjadi:
```ts
for (const update of updates) {
  if (typeof update.update_id === "number") {
    next = Math.max(next, update.update_id + 1);
  }
  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (chatId == null) continue;

  if (isChatIdCommand(text)) {
    await sendTelegramMessage(chatId, buildChatIdReply(chatId));
  } else if (isOnlineCommand(text)) {
    if (await isRegisteredAdminChatId(chatId)) {
      await sendTelegramMessage(chatId, await buildOnlineReply());
    }
    // Chat ID tidak terdaftar sebagai Superadmin → diamkan (jangan bocorkan
    // info petugas online ke sembarang orang yang chat ke bot).
  }
}
```

**Perhatikan:** ini membuat `telegramPolling.ts` (yang tadinya bebas DB)
sekarang bergantung ke `telegramAdminScheduler.ts` (DB-touching). Ini
perubahan yang disengaja — test `processTelegramUpdates` yang sudah ada
di `lib/__tests__/telegramPolling.test.ts` untuk kasus `/start`/`/id`
TIDAK menyentuh path `/online`, jadi tidak perlu mock Prisma untuk test
lama tetap lulus. Kalau nanti mau nambah test untuk path `/online`, itu
butuh mock modul `telegramAdminScheduler` (`vi.mock`) — opsional, tidak
wajib untuk fitur ini selesai.

---

## 6. `app/api/tickets/route.ts` — notif tiket dibuat

Tambah import di baris 6 (setelah `import { listTickets } from
"@/lib/ticketQueries";`):
```ts
import { notifyTicketCreated } from "@/lib/telegramAdminScheduler";
import { SHIFT_LABELS } from "@/lib/constants";
```

Setelah `return t;` di dalam `$transaction` selesai dan variabel
`ticket` didapat (baris 246-247, sebelum `return NextResponse.json(...)`
baris 249), tambahkan (di LUAR transaksi — jangan di dalam
`$transaction`, supaya request Telegram tidak ikut menahan koneksi DB):
```ts
await notifyTicketCreated({
  noTiket: ticket.noTiket,
  kodeAtm: atm.kodeAtm,
  namaAtm: atm.namaAtm,
  petugasNama: session.nama,
  shiftLabel: SHIFT_LABELS[shiftKode] ?? shiftKode,
  jenisGangguan,
});
```
(`atm` sudah ada di scope dari `prisma.atmMaster.findUnique` baris 101;
`jenisGangguan` & `session` juga sudah ada di scope function ini — cek
nama variabel persis saat baca file, jangan asumsi kalau ternyata beda.)

`notifyTicketCreated` sudah tidak melempar error (self-catch di langkah
4), jadi TIDAK perlu bungkus try/catch tambahan di sini — samakan gaya
dengan pemanggilan `notifyReportPending` di `app/api/shift/close/route.ts`
& `app/api/shift/handover/route.ts` (`await` polos, tanpa try/catch).

---

## 7. `app/api/shift/route.ts` — notif mulai shift

Tambah import:
```ts
import { SHIFT_LABELS } from "@/lib/constants";
import { notifyShiftStarted } from "@/lib/telegramAdminScheduler";
```

Baris 30-34 sudah menghasilkan `{ startedAt }` dari `shiftSessionStart`
— destructure juga `lanjutan`:
```ts
const { startedAt, lanjutan } = shiftSessionStart(
  shift as ShiftCode,
  user?.currentShift,
  user?.shiftStartedAt
);
```

Setelah `prisma.user.update(...)` (baris 37-40), tambahkan gate
`!lanjutan` supaya hanya sesi BARU yang dinotif (bukan resume/refresh):
```ts
if (!lanjutan) {
  await notifyShiftStarted({
    petugasNama: session.nama,
    shiftLabel: SHIFT_LABELS[shift] ?? shift,
    startedAt,
  });
}
```

---

## 8. `app/api/shift-reports/[id]/approve/route.ts` — notif approve

Tambah import:
```ts
import { notifyReportApproved } from "@/lib/telegramAdminScheduler";
```

Setelah blok `if (result.status === "pending") { ... }` (baris 96-102),
sebelum `return NextResponse.json(...)` (baris 104), tambahkan notif ke
admin — jalan untuk SEMUA hasil sukses (`result.kind === "ok"`), bukan
cuma yang statusnya masih `"pending"` (beda dari blok reminder di
atasnya yang memang cuma untuk kasus belum lengkap):
```ts
await notifyReportApproved({
  shiftLabel: report.shiftLabel,
  tanggal: report.tanggal,
  petugasNama: report.ownerUser?.nama ?? "-", // lihat catatan di bawah
  supervisiNama: session.nama,
  peran,
});
```
**Catatan:** variabel `report` di file ini (hasil `findUnique` baris 42)
TIDAK include relasi `ownerUser` — kalau `petugasNama` mau ambil dari situ
harus tambah `include: { ownerUser: { select: { nama: true } } }` di
query baris 42, ATAU (lebih murah) query ulang cukup `select: {
ownerUser: { select: { nama: true } } }` pakai `id` yang sudah ada. Pilih
salah satu, jangan query relasi yang tidak dipakai di tempat lain supaya
tidak nambah beban row lock yang sudah ada di transaksi (baris 68) —
taruh query tambahan ini DI LUAR `$transaction`, setelah blok reminder,
supaya tidak ikut ditahan row lock `FOR UPDATE`.

---

## JANGAN LAKUKAN

- Jangan pakai `bolehKirimNotif()` (gate Senin-Jumat 07:00-18:00) untuk
  ketiga notif baru ini — sudah dijelaskan di atas kenapa (monitoring
  24/7, beda tujuan dari reminder approval Supervisi).
- Jangan ubah alur/isi notif reminder approval Supervisi yang sudah ada
  (`telegramNotif.ts`, `telegramScheduler.ts`) — fitur ini murni
  penambahan, bukan modifikasi fitur lama.
- Jangan hapus/ubah pembatasan `username`/`role`/`isAktif` untuk akun
  superadmin di `ManajemenAkunClient.tsx` maupun
  `app/api/users/[id]/route.ts` — HANYA field Telegram
  (`telegramChatId`/`telegramNomor`) yang dibuka untuk role ini.
- Jangan buat command `/online` bisa diakses sembarang Chat ID — WAJIB
  cek `isRegisteredAdminChatId` dulu, kalau tidak terdaftar DIAMKAN saja
  (jangan balas error/pesan penolakan — itu justru mengonfirmasi ke orang
  asing bahwa bot ini punya fitur tersembunyi).
- Jangan tambah migrasi Prisma / kolom baru — semua reuse kolom yang
  sudah ada.
- Jangan taruh pemanggilan fungsi notif (`notifyTicketCreated` dkk) DI
  DALAM blok `$transaction` mana pun — request HTTP ke Telegram tidak
  boleh menahan transaksi/row-lock database.

---

## VERIFIKASI SETELAH SELESAI

- `./node_modules/.bin/tsc --noEmit` (bukan `npx`).
- `./node_modules/.bin/vitest run` — pastikan test lama
  (`telegramNotif.test.ts`, `telegramPolling.test.ts`, `telegram.test.ts`)
  masih lulus tanpa diubah asersinya.
- Set `TELEGRAM_BOT_TOKEN` di `.env` (kalau belum), lalu di Manajemen
  Akun → edit akun Superadmin sendiri → field "Chat ID Telegram" harus
  muncul (sebelumnya tersembunyi) → isi Chat ID (dapat dari `/id` ke bot)
  → simpan → klik "Kirim Notif Test" → pesan konfirmasi masuk ke
  Telegram.
- Login sebagai petugas (`user`) → pilih shift di Dashboard → pesan
  "Petugas Mulai Shift" masuk ke Telegram Superadmin. Refresh halaman /
  pilih shift yang SAMA lagi → TIDAK ada notif baru (gate `lanjutan`).
- Buka tiket baru (Open Tiket) → pesan "Tiket Baru Dibuka" masuk berisi
  No Tiket, Kode+Nama ATM yang benar, nama petugas, shift, jenis
  gangguan.
- Login sebagai Supervisi → approve satu laporan shift (non shift
  malam) → pesan "Laporan Shift Disetujui" masuk dengan peran
  "Supervisi". Untuk laporan shift malam (C/E) dengan 2 supervisi
  berbeda → dua pesan terpisah (utama, lalu selanjutnya) saat masing-
  masing approve. Kalau satu orang jadi kedua peran sekaligus → satu
  pesan dengan label "Supervisi Utama & Selanjutnya".
- Kirim `/online` dari akun Telegram yang Chat ID-nya SUDAH terdaftar
  sebagai Superadmin → bot balas daftar petugas dengan shift aktif.
  Kirim `/online` dari akun Telegram LAIN (belum terdaftar) → bot diam
  saja, tidak ada balasan apa pun.
- Cek fitur lama TIDAK regresi: reminder approval Supervisi (Fase 4)
  tetap jalan seperti sebelumnya, field Telegram akun `user` (Petugas)
  tetap tidak tampil di Manajemen Akun (fitur ini cuma untuk
  Supervisi & Superadmin).
