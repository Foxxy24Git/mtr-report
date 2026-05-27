# PRD — mtr-Report
**Aplikasi Digitalisasi Laporan Penanganan Gangguan ATM & Jaringan**
**Bank Nagari (Bank Pembangunan Daerah Sumatera Barat)**

> Versi: 1.0 · Dokumen Kebutuhan Produk (Product Requirements Document)
> Tujuan: Mendigitalisasi laporan harian penanganan gangguan ATM & jaringan komunikasi yang saat ini dikerjakan manual di Excel, menjadi aplikasi web multi-user dengan sistem shift, tiket, monitoring realtime, SLA otomatis, dan rekap laporan yang outputnya identik dengan template Excel existing.

---

## 1. Ringkasan Produk

mtr-Report adalah aplikasi web internal untuk petugas monitoring jaringan & ATM. Aplikasi ini menggantikan proses pelaporan manual di Excel. Setiap petugas (per shift) membuka tiket gangguan ATM/jaringan, mencatat kronologi penanganan secara realtime/berkala (dengan timestamp otomatis), menyerahkan monitoring ke shift berikutnya, lalu menutup tiket. Supervisi mereview dan meng-approve tiket yang sudah close. Hasil akhir dapat diunduh sebagai Excel yang **persis sama** dengan format laporan harian existing (Form OPS-001) lengkap dengan logo Bank Nagari dan blok tanda tangan.

### 1.1 Masalah yang Diselesaikan
- Pelaporan manual di Excel rawan tidak konsisten, sulit di-track lintas shift, dan tidak ada audit trail waktu.
- Tidak ada dashboard real-time jumlah tiket open.
- Perhitungan SLA manual.
- Serah-terima antar shift tidak terstruktur ("Tindak Lanjut Monitoring Selanjutnya").
- Approval supervisi & tanda tangan masih manual.

### 1.2 Pengguna Sasaran
Tim monitoring jaringan & ATM Divisi TI Bank Nagari yang bekerja dalam sistem 3 shift (hari kerja) / 2 shift (akhir pekan).

---

## 2. Peran Pengguna (Roles)

| Role | Hak Akses |
|------|-----------|
| **Super Admin** | Full akses. Kelola user, master data, setting global, semua tiket, semua rekap. |
| **User (Petugas Monitoring)** | Open tiket, update kegiatan realtime, serah-terima shift, close tiket, tambah master ATM/jaringan, upload suhu AC & log server, lihat dashboard, download rekap miliknya. |
| **Supervisi** | Melihat tiket yang sudah **close**, melihat seluruh kronologi kegiatan, meng-**approve** (tanda tangan digital supervisi otomatis dibubuhkan setelah approve). |

### 2.1 Daftar User Awal (seed)
**User (petugas):**
1. `mtr1` — Afrinaldi
2. `mtr2` — Rian Islami Putra
3. `mtr3` — Kurnia Fajri
4. `mtr4` — Ibnu Sauki
5. `mtr5` — Ridho M R

**Supervisi:** Tio Rahmayunda, Berto L (dan dapat ditambah).

> Setiap user & supervisi memiliki: foto profil, tanda tangan digital, dapat ganti password.

---

## 3. Sistem Shift

Shift dipilih saat login/mulai laporan. Pilihan shift (5 opsi):

| Kode | Jam | Berlaku |
|------|-----|---------|
| A | 07:00 – 15:00 | Senin–Jumat (3 shift) |
| B | 15:00 – 23:00 | Senin–Jumat |
| C | 23:00 – 07:00 | Senin–Jumat |
| D | 07:00 – 19:00 | Sabtu–Minggu (2 shift) |
| E | 19:00 – 07:00 | Sabtu–Minggu |

- **Hari kerja (Sen–Jum):** hanya shift A, B, C yang valid.
- **Akhir pekan (Sab–Min):** hanya shift D, E yang valid.
- Tiket yang belum selesai di akhir shift ditandai **"TINDAK LANJUT MONITORING SELANJUTNYA"** dan diteruskan ke shift berikutnya (tetap satu tiket, ganti PIC/owner shift).

---

## 4. Fitur Utama (Modul)

### A. Dashboard
- **Kartu jumlah Open Tiket**, dipisah:
  - Open tiket **ATM** (jumlah)
  - Open tiket **Jaringan Kantor** (jumlah)
- Pemisahan tiket berdasarkan **kepemilikan**:
  - Tiket yang di-open oleh **user (shift) ini sendiri**
  - Tiket yang **dilanjutkan** (diterima dari shift sebelumnya)
- **Kalender**: tanggal yang memiliki tiket sedang berjalan / masih diproses ditandai (badge/dot). Klik tanggal → daftar tiket di tanggal itu.
- **Alert (pojok kanan bawah)**: notifikasi untuk setiap ATM/jaringan yang masih open tiket. **Status ATM yang open di-refresh otomatis setiap 1 jam sekali.**
- Indikator visual per shift (tiket per shift A/B/C/D/E).

### B. Daily Monitoring
Tracking semua open tiket (ATM & jaringan kantor). Tabel kolom:

`Kode ATM | No Tiket | Tanggal Open Tiket | PIC | Update Status (yang sedang dikerjakan) | PIC | Status (badge: Selesai/Proses) | Status Supervisi (Belum Approve / Sudah Approve)`

Saat klik tiket → buka detail tiket. Di detail tiket user dapat:
1. **Update status ATM** sesuai pilihan di Excel (Dalam Proses / Selesai).
2. **Ubah** jenis gangguan, sumber penyebab gangguan, metode penanganan gangguan, vendor jaringan/ATM.
3. **Fitur Kegiatan Penanganan Gangguan (PENTING — selalu di-update):**
   - Setiap entri kegiatan dicatat **timestamp otomatis** (jam saat user submit).
   - Bersifat log berurutan (seperti kolom "Uraian Kegiatan" di Excel).
   - **Editable dengan jejak**: tiap entri punya tombol **Edit** untuk memperbaiki teks (typo) maupun mengoreksi waktu/jam entri. Perubahan disimpan ke entri yang sama (bukan entri baru) dan mencatat `edited_at` + `edited_by` plus snapshot revisi, sehingga rekam jejak tetap terjaga. Entri yang pernah diubah diberi penanda kecil **"diedit"**.
   - **Hak edit**: hanya **pembuat entri** atau **Super Admin** (Supervisi hanya melihat). Penanda serah terima shift tidak dapat diedit.
   - Saat pindah shift, sistem menambahkan penanda **"TINDAK LANJUT MONITORING SELANJUTNYA"** sebelum entri shift baru.
4. **Close tiket** (set status Selesai + Waktu Selesai Gangguan otomatis).
5. **Hapus tiket** (use-case: ATM hanya error sesaat, tidak perlu tiket). → aksi destruktif, perlu konfirmasi.
6. **Tampilkan SLA tiket** dihitung otomatis (rumus di §7).
7. Sebelum open tiket / saat finalisasi: pilih **Pimpinan Bag. Infrastruktur** dan **Pimpinan Divisi** (mendukung PJS/pengganti — daftar dapat dipilih).

### C. Open Tiket
Form untuk membuka tiket gangguan ATM/jaringan:
1. **Pencarian ATM/lokasi** — cari berdasarkan ID ATM dan lokasi (autocomplete dari master). Menampilkan juga **vendor ATM**.
2. **No Tiket auto-generate** dengan rule: prefix `BN-` + kode campuran angka & huruf. Contoh: `BN-28A37163`. (8 karakter alfanumerik uppercase setelah `BN-`.)
3. **Contact Person** — 2 pilihan:
   - **No PIC** → wajib isi nama + nomor telepon.
   - **WAG** (Whatsapp Group) → cukup pilih WAG.
4. **Jenis Gangguan** — dropdown dari master.
5. **Sumber Penyebab Gangguan** — dropdown dari master.
6. **Metode Penanganan Gangguan** — dropdown dari master.
7. **Vendor** (opsional).
8. **No Tiket dari Vendor** (opsional).
9. **Kegiatan (WAJIB)** — entri kegiatan pertama, akan terus di-update realtime/berkala.
10. **Waktu open tiket dicatat otomatis** (timestamp).

### D. Rekap Laporan
1. **Download Harian** → output **Excel identik** dengan template (Form OPS-001), termasuk header, kolom, blok suhu AC + log server, blok tanda tangan, dan **logo Bank Nagari**.
2. **Download per User** → hanya tiket yang di-open oleh user terkait.
3. **Logo Bank Nagari** wajib disertakan sesuai posisi di Excel.

### F. Data ATM & Jaringan
Setiap user dapat menambah data ATM/jaringan:
1. ID ATM
2. Nama ATM
3. Cabang ATM
4. Alamat ATM
5. Vendor ATM
6. Vendor Jaringan ATM

> Data master ATM awal (±558 entri) di-seed dari sheet MASTER (cukup sebagian, sisanya ditambah user). Lihat §6.

### G. Setting
- Ganti password.
- Tambah user (role User atau Supervisi) — hanya Super Admin.
- Tambah/ubah tanda tangan digital (upload gambar TTD).
- Tambah/ubah foto profil.
- (Super Admin) kelola daftar Pimpinan Bag. Infrastruktur & Pimpinan Divisi (untuk PJS).

### H. Monitoring Suhu AC & Log Server
- **Suhu AC**: setiap shift dilakukan **3x pengecekan** suhu. Form upload: waktu pemantauan + suhu Room Server + suhu Ruangan Panel + status aktif AC (kiri/kanan) + pemantauan berkala 12 jam. (Lihat blok di Excel: O5:R9.)
- **Log Server**: pemantauan log server untuk **NPAY, AJ-ATMB, BI-FAST, PRIMA, Cip-Host**. Diisi **di awal & akhir shift saja** (2x). Status per server (mis. "Transaksi Normal"/"Normal").

---

## 5. Struktur Data Laporan (mapping ke kolom Excel)

Laporan harian (1 sheet per shift per hari). Kolom tabel tiket (baris header di Excel = baris 12–13):

| Kol Excel | Field | Sumber |
|-----------|-------|--------|
| B | No | auto urut |
| C | Waktu Kejadian Gangguan | timestamp open / input |
| D | Unit Kerja/Tempat Kejadian | ID + lokasi ATM (master) |
| E | Waktu Respon Penanganan Internal | input (boleh "-") |
| F | Contact Person | No PIC (nama+telp) / WAG |
| G | Jenis Gangguan | master |
| H | Sumber Penyebab Gangguan | master |
| I | Metode Penanganan Gangguan | master |
| J | Vendor Jaringan/ATM | input/opsional |
| K | (sub: Waktu) Uraian Kegiatan | timestamp tiap entri |
| L | (sub: Kegiatan) Uraian Kegiatan | teks log append |
| M | No Tiket Aduan dari Vendor | opsional |
| N | Waktu Selesai Gangguan | timestamp close / "Dalam Proses" |
| O | Lama Penyelesaian (hh:mm) | `=N-C` |
| P | Lama Penyelesaian (Menit) | `=O*24*60` |
| Q | Total Waktu 1 Bulan (Menit) | `=TotalMenitBulan - P` |
| R | SLA (%) otomatis | `=Q / TotalMenitBulan` |
| S | Keterangan | input |

> Catatan: Untuk tiket yang masih berjalan (belum close), N = "Dalam Proses", dan Q diisi teks **"Monitoring Dilanjutkan oleh Shift berikutnya"** (kolom N:P & Q:R di-merge pada baris tsb), R kosong.

Header laporan (atas):
- B2: "LAPORAN HARIAN PENANGANAN GANGGUAN"
- B3: "SISTEM ATM DAN JARINGAN KOMUNIKASI" · S3: "FORM OPS-001"
- B8: Hari / Tgl · B9: Nama Petugas · B10: Waktu Shift
- Blok G5:I10 = Pemeriksaan Akhir Monitoring (log server awal), K5:L10 = (log server akhir)
- Blok N5:R9 = Suhu AC (Waktu pemantauan 3x, suhu room server, suhu panel, status aktif kiri/kanan, pemantauan 12 jam)
- O10/S10: "Total Menit dalam Bulan = `=24*60*<jumlah_hari>`"

Blok tanda tangan (baris 25–31):
- B25: "Padang, <tanggal>"
- C26: Petugas Monitoring yang menyerahkan → C31: ( nama )
- F26: Petugas Monitoring yang Menerima → F31: ( nama )
- I26: Supervisi → I31: ( nama )
- O26: Mengetahui, Bag. Infrastruktur TI → O31: ( nama ) Pemimpin
- R26: Mengetahui, Pemimpin Divisi → R31: ( nama ) Pemimpin

---

## 6. Master Data (Seed)

Disediakan file referensi `master_seed.json` & `master_atm_full.txt`. Ringkasan:

- **Jenis Penanganan Gangguan**: 24 item (mis. "Penanganan gangguan oleh vendor ATM", "Penanganan gangguan jaringan komunikasi pd Divisi TI", dst.)
- **Jenis Gangguan**: 32 item (mis. "ATM Offline", "ATM Out of Service", "Jaringan Kantor Offline", "Switching Prima down", "Tindak Lanjut Monitoring Sebelumnya", dst.)
- **Sumber Penyebab Gangguan**: 49 item (mis. "Dispenser ATM rusak", "Cash Handler – Fatal", "Listrik PLN Mati", "Gangguan pada Jaringan Lintasarta", dst.)
- **ID & Lokasi ATM**: 558 entri (format `<kode> – <nama lokasi>`, mis. `010101 – ATM CAPEM IBUH PYK`). Seed sebagian (±30–50), sisanya ditambah user.

> Saat implementasi, seed dapat diambil langsung dari file ini agar dropdown langsung terisi.

---

## 7. Rumus SLA

Definisi (sesuai Excel, dengan koreksi referensi):

```
TotalMenitBulan   = 24 * 60 * jumlah_hari_dalam_bulan      (mis. 30 hari = 43.200)
LamaHHMM          = WaktuSelesai - WaktuKejadian            (format jam:menit)
LamaMenit         = LamaHHMM dalam menit
UptimeMenit       = TotalMenitBulan - LamaMenit
SLA%              = UptimeMenit / TotalMenitBulan           (format persen, 2 desimal)
```

- Tiket **belum selesai** → tidak dihitung SLA (tampilkan "Dalam Proses").
- Bila satu ATM punya beberapa episode gangguan dalam sebulan, LamaMenit diakumulasi (catatan untuk rekap bulanan — opsional fase lanjut).

---

## 8. Kebutuhan Non-Fungsional

- **UI/UX profesional**, sedikit animasi (transisi halus, micro-interaction) agar nyaman dipandang. Tema: nuansa korporat Bank Nagari.
- **Responsive** (desktop utama; tablet/mobile didukung).
- **Auto-refresh status ATM open setiap 1 jam** (polling/interval).
- **Audit trail**: setiap entri kegiatan & perubahan status menyimpan timestamp + user.
- **Multi-user** dengan autentikasi & otorisasi berbasis role.
- **Export Excel** harus byte-faithful terhadap template (gunakan template .xlsx + openpyxl/exceljs, isi sel sesuai mapping §5).
- Bahasa antarmuka: **Indonesia**.

---

## 9. Saran Tech Stack (untuk pemula/lab Proxmox)

> Dipilih agar mudah dipelajari, mudah di-deploy di lab Proxmox/VM, dan ringan.

- **Frontend**: React + Vite + Tailwind CSS (animasi: Framer Motion ringan). Komponen kalender: react-day-picker. Chart kecil: recharts.
- **Backend**: Node.js + Express (atau FastAPI Python bila lebih nyaman). REST API.
- **Database**: PostgreSQL (atau SQLite untuk tahap awal/belajar).
- **Auth**: JWT + bcrypt (password hashing). Role-based access control.
- **Export Excel**: `exceljs` (Node) atau `openpyxl` (Python) dengan template laporan.
- **Deploy**: Docker Compose (frontend + backend + db) → jalan di satu VM Proxmox.

> Stack alternatif super-ringkas untuk belajar cepat: **Next.js (full-stack) + Prisma + SQLite/PostgreSQL**. Satu repo, mudah dideploy.

---

## 10. Skema Database (ringkas)

```
users(id, username, nama, role[superadmin|user|supervisi], password_hash,
      foto_profil_url, ttd_url, created_at)

leaders(id, nama, jabatan[infrastruktur|divisi], is_pjs, aktif)

atm_master(id, kode_atm, nama_atm, cabang, alamat, vendor_atm, vendor_jaringan)

master_lookup(id, tipe[jenis_gangguan|sumber_penyebab|jenis_penanganan], nilai)

tickets(id, no_tiket[BN-xxxxxxxx], kategori[atm|jaringan], atm_id,
        waktu_open, waktu_respon_internal, cp_tipe[pic|wag], cp_nama, cp_telp,
        jenis_gangguan, sumber_penyebab, metode_penanganan,
        vendor, no_tiket_vendor, status[proses|selesai], waktu_selesai,
        status_supervisi[belum|approved], approved_by, approved_at,
        pimpinan_infra_id, pimpinan_divisi_id,
        shift_kode, owner_user_id, created_at, keterangan)

ticket_activities(id, ticket_id, user_id, shift_kode, waktu(ts), teks,
                  is_tindak_lanjut_flag, created_at, edited_at, edited_by)

ticket_activity_revisions(id, activity_id, teks, waktu, edited_by, edited_at)  -- snapshot nilai sebelum tiap edit

shift_handovers(id, ticket_id, from_user, to_user, from_shift, to_shift, at)

ac_temp_logs(id, tanggal, shift_kode, user_id, urutan[1|2|3],
             waktu_pantau, suhu_room_server, suhu_panel,
             status_aktif_kiri, status_aktif_kanan, pantau_12jam_kiri, pantau_12jam_kanan)

server_logs(id, tanggal, shift_kode, user_id, fase[awal|akhir],
            npay, aj_atmb, bifast, prima, cip_host)
```

---

## 11. Acceptance Criteria (kunci)

1. User dapat open tiket dengan no auto `BN-` + 8 alfanumerik unik.
2. Setiap entri kegiatan tersimpan dengan timestamp. Entri dapat diedit (teks & waktu) oleh pembuatnya atau Super Admin, dengan jejak audit (`edited_at` + `edited_by` + snapshot revisi) dan penanda "diedit".
3. Pindah shift menyisipkan penanda "TINDAK LANJUT MONITORING SELANJUTNYA".
4. Dashboard menampilkan jumlah open tiket ATM vs jaringan, terpisah owner vs lanjutan, + kalender bertanda + alert kanan-bawah + refresh status 1 jam.
5. SLA dihitung otomatis sesuai §7.
6. Supervisi approve → TTD digital supervisi otomatis muncul di laporan.
7. Rekap harian & per-user diunduh sebagai Excel identik template (logo + tanda tangan + suhu/server).
8. Master ATM, jenis gangguan, sumber penyebab, metode penanganan tersedia sebagai dropdown (seed dari Excel).
9. RBAC: Super Admin > User > Supervisi sesuai §2.
10. UI Indonesia, profesional, beranimasi halus.

---

## 12. Fase Pengembangan (ringkas — detail di Prompt.md)

- **Fase 0** — Setup proyek, struktur, tema/desain system.
- **Fase 1** — Database + seed master + auth + RBAC.
- **Fase 2** — Modul Open Tiket + Data ATM/Jaringan.
- **Fase 3** — Daily Monitoring + kegiatan realtime + shift handover + SLA + close/hapus.
- **Fase 4** — Dashboard (kartu, kalender, alert, auto-refresh).
- **Fase 5** — Suhu AC & Log Server.
- **Fase 6** — Rekap Laporan (export Excel identik + logo + TTD).
- **Fase 7** — Setting (user, password, TTD, foto, pimpinan/PJS) + polish UI/animasi.
