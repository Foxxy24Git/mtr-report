# Prompt.md — mtr-Report (Prompt Berfase / Hemat Token)

> **Cara pakai:** Jalankan **satu fase per sesi** ke AI coding assistant (Claude Code, Cursor, dll). Setiap fase dirancang mandiri & merujuk ke `PRD.md` agar tidak mengulang konteks (hemat token). Selalu sertakan `PRD.md`, `master_seed.json`, dan `master_atm_full.txt` di workspace. Jangan tempel ulang isi PRD ke dalam prompt — cukup rujuk filenya.
>
> **Aturan global (tempel sekali di awal tiap sesi bila perlu):**
> "Patuhi `PRD.md`. Bahasa UI Indonesia. Stack: lihat PRD §9 (default: Next.js full-stack + Prisma + PostgreSQL/SQLite, Tailwind, Framer Motion). Tulis kode bersih, beri komentar singkat untuk pemula. Jangan buat fitur di luar fase yang diminta. Setelah selesai, beri ringkasan file yang dibuat + cara menjalankannya."

---

## FASE 0 — Setup & Desain Sistem

```
Baca PRD.md. Ini Fase 0: setup proyek mtr-Report.

Tugas:
1. Inisialisasi proyek full-stack Next.js (App Router) + TypeScript + Tailwind CSS + Prisma + Framer Motion.
2. Siapkan struktur folder rapi: /app, /components, /lib, /prisma, /public (logo).
3. Buat design system ringan: palet warna korporat (biru Bank Nagari + aksen), tipografi, komponen dasar (Button, Card, Badge, Input, Modal, Table) dengan animasi halus.
4. Buat layout shell: sidebar navigasi (Dashboard, Daily Monitoring, Open Tiket, Rekap Laporan, Data ATM, Suhu/Server, Setting) + topbar (profil, shift aktif).
5. Konfigurasi .env (DATABASE_URL), docker-compose untuk db + app (deploy di Proxmox).

Output: struktur proyek jalan (`npm run dev`), shell UI tampil, belum ada logika bisnis.
Beri instruksi menjalankan + screenshot mental layout.
```

---

## FASE 1 — Database, Seed Master, Auth & RBAC

```
Baca PRD.md (§2, §6, §10). Ini Fase 1.

Tugas:
1. Implementasi skema Prisma sesuai PRD §10 (users, leaders, atm_master, master_lookup, tickets, ticket_activities, shift_handovers, ac_temp_logs, server_logs).
2. Seed:
   - Master lookup dari master_seed.json (jenis_penanganan, jenis_gangguan, sumber_penyebab).
   - atm_master: ambil 40 entri pertama dari master_atm_full.txt (format "<kode> – <nama>"; pisahkan kode & nama).
   - users: mtr1..mtr5 (role user) + 1 superadmin + 2 supervisi (Tio Rahmayunda, Berto L). Password default di-hash (bcrypt).
   - leaders: contoh Bag. Infrastruktur & Pemimpin Divisi (+1 PJS).
3. Auth: login (JWT + bcrypt), middleware proteksi route, RBAC 3 role (superadmin/user/supervisi) sesuai PRD §2.
4. Halaman login + pemilihan SHIFT saat masuk (validasi: Sen–Jum hanya A/B/C, Sab–Min hanya D/E — PRD §3).

Output: bisa login, shift tersimpan di sesi, route terproteksi sesuai role. Tampilkan tabel migrasi & cara seed.
```

---

## FASE 2 — Open Tiket & Data ATM/Jaringan

```
Baca PRD.md (§4.C, §4.F, §5). Ini Fase 2.

Tugas:
1. Modul "Data ATM & Jaringan": CRUD atm_master (ID, nama, cabang, alamat, vendor ATM, vendor jaringan). Semua user boleh tambah.
2. Modul "Open Tiket" — form sesuai PRD §4.C:
   - Pencarian ATM (autocomplete by kode/lokasi, tampilkan vendor ATM).
   - No tiket auto-generate rule "BN-" + 8 alfanumerik uppercase unik (cek unik di DB). Contoh BN-28A37163.
   - Contact Person: radio [No PIC | WAG]. Jika No PIC → wajib nama + telp.
   - Dropdown: Jenis Gangguan, Sumber Penyebab, Metode Penanganan (dari master_lookup).
   - Vendor (opsional), No Tiket Vendor (opsional).
   - Kategori tiket: ATM | Jaringan (wajib, untuk pemisahan dashboard).
   - Kegiatan pertama (WAJIB) → simpan sebagai ticket_activities entri pertama dengan timestamp.
   - waktu_open dicatat otomatis, owner = user shift saat ini, shift_kode tersimpan.
3. Validasi form + simpan ke DB.

Output: bisa tambah ATM & open tiket; tiket muncul di DB dengan no BN- unik. Tampilkan demo alur.
```

---

## FASE 3 — Daily Monitoring, Kegiatan Realtime, Shift Handover, SLA

```
Baca PRD.md (§4.B, §3, §7). Ini Fase 3 (inti aplikasi).

Tugas:
1. Halaman "Daily Monitoring": tabel open tiket (ATM & jaringan) kolom:
   Kode ATM | No Tiket | Tgl Open | PIC | Update Status terkini | PIC | Status(badge Selesai/Proses) | Status Supervisi(Belum/Approved).
   Filter: kategori (ATM/jaringan), shift, owner vs lanjutan.
2. Klik tiket → halaman detail:
   a. Edit jenis gangguan / sumber penyebab / metode penanganan / vendor.
   b. Fitur Kegiatan (PENTING, append-only): textarea + tombol "Simpan Kegiatan" → buat ticket_activities baru dgn timestamp otomatis + user + shift. Tampilkan log kronologis (waktu + teks), tidak bisa dihapus/diedit.
   c. Tombol "Serah Terima Shift": catat shift_handovers + sisipkan entri kegiatan penanda "TINDAK LANJUT MONITORING SELANJUTNYA", ubah owner ke user shift berikutnya.
   d. Tombol "Close Tiket": status=selesai, waktu_selesai=now.
   e. Tombol "Hapus Tiket": konfirmasi modal (use-case error sesaat). Hanya owner/superadmin.
   f. Panel SLA: hitung otomatis sesuai PRD §7 (TotalMenitBulan=24*60*hari; LamaMenit; SLA%). Tiket belum selesai → tampil "Dalam Proses".
   g. Pilih Pimpinan Bag. Infrastruktur & Pimpinan Divisi (dropdown leaders, dukung PJS).

Output: alur monitoring penuh berfungsi; log kegiatan ber-timestamp; handover & SLA jalan. Demo end-to-end satu tiket.
```

---

## FASE 4 — Dashboard

```
Baca PRD.md (§4.A). Ini Fase 4.

Tugas:
1. Kartu metrik: jumlah open tiket ATM vs Jaringan (terpisah). Sub-pisah: tiket milik shift ini vs tiket lanjutan.
2. Kalender (react-day-picker): tandai tanggal yang punya tiket masih proses (dot/badge). Klik tanggal → list tiket tanggal itu.
3. Indikator per shift (A–E): jumlah tiket per shift.
4. Alert pojok kanan-bawah: toast/badge daftar ATM/jaringan yang masih open.
5. Auto-refresh status ATM open tiap 1 jam (interval polling) + tombol refresh manual.

Output: dashboard interaktif & beranimasi. Pastikan data nyata dari DB (bukan dummy).
```

---

## FASE 5 — Suhu AC & Log Server

```
Baca PRD.md (§4.H, §5 blok suhu/server). Ini Fase 5.

Tugas:
1. Form "Suhu AC" per shift: 3x pengecekan (urutan 1/2/3) → waktu pantau, suhu room server, suhu panel, status aktif (Kiri/Kanan), pemantauan berkala 12 jam (Kiri/Kanan). Simpan ac_temp_logs.
2. Form "Log Server": server NPAY, AJ-ATMB, BI-FAST, PRIMA, Cip-Host. Fase awal & akhir shift saja (2x). Status tiap server (Transaksi Normal/Normal/Gangguan). Simpan server_logs.
3. Tampilan ringkas per tanggal+shift untuk dipakai saat export laporan.

Output: input suhu & log server tersimpan dan tampil per shift/tanggal.
```

---

## FASE 6 — Rekap Laporan (Export Excel Identik)

```
Baca PRD.md (§4.D, §5, §7). Ini Fase 6 (kritikal: output harus PERSIS template).

Konteks: gunakan layout Excel existing sebagai acuan sel-per-sel (PRD §5 berisi mapping kolom B–S, header B2/B3/S3, blok suhu N5:R9, blok log server G5:L10, total menit O10/S10, blok tanda tangan baris 25–31, logo Bank Nagari).

Tugas:
1. Endpoint export Excel (pakai exceljs). Buat generator yang mengisi sel sesuai mapping PRD §5 sehingga hasil identik template:
   - Header, Hari/Tgl, Nama Petugas, Waktu Shift.
   - Tabel tiket B12:S.. dengan rumus O=N-C, P=O*24*60, Q=TotalMenit-P, R=Q/TotalMenit (untuk tiket selesai). Tiket proses: N="Dalam Proses", Q (merge) = "Monitoring Dilanjutkan oleh Shift berikutnya".
   - Blok suhu AC & log server dari Fase 5.
   - Logo Bank Nagari (taruh file di /public, embed sebagai image di posisi sesuai Excel).
   - Blok tanda tangan: nama petugas penyerah/penerima, supervisi (TTD digital jika sudah approve), pimpinan infrastruktur & divisi.
2. Tombol "Download Harian" (pilih tanggal+shift) dan "Download per User" (filter owner).
3. Pastikan merge cell & format jam sesuai (C/K/N format jam, R format %).

Output: file .xlsx terunduh yang tampak identik dengan template. Sertakan 1 contoh hasil untuk satu hari/shift.
```

---

## FASE 7 — Setting & Polish

```
Baca PRD.md (§4.G, §8). Ini Fase 7 (final).

Tugas:
1. Setting:
   - Ganti password (semua user).
   - Tambah user (role user/supervisi) — superadmin only.
   - Upload/ubah tanda tangan digital (gambar).
   - Upload/ubah foto profil.
   - Kelola daftar Pimpinan Infrastruktur & Divisi + flag PJS (superadmin).
2. Integrasi TTD: setelah supervisi approve tiket close → status_supervisi=approved, TTD supervisi otomatis terpasang di laporan.
3. Polish UI/UX: animasi transisi halus, loading state, empty state, responsive, konsistensi tema. Aksesibilitas dasar.
4. QA terhadap Acceptance Criteria PRD §11 (cek 1–10).

Output: aplikasi lengkap & rapi. Beri checklist §11 yang sudah terpenuhi + cara deploy final (docker-compose di Proxmox).
```

---

## Tips Hemat Token
- **Satu fase = satu sesi.** Jangan gabung fase.
- Rujuk file (`PRD.md §X`) alih-alih menyalin isinya.
- Untuk perbaikan kecil, kirim hanya nama file + diff yang diinginkan, bukan seluruh kode.
- Simpan keputusan stack di awal agar tidak diulang tiap prompt.
- Jika AI mulai melebar, ingatkan: "Fokus hanya pada Fase N."
