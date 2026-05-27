# mtr-Report

Aplikasi digitalisasi **Laporan Harian Penanganan Gangguan ATM & Jaringan Komunikasi** Bank Nagari (Form OPS-001). Menggantikan pelaporan manual Excel: tiket gangguan, kegiatan per shift, serah-terima antar shift, persetujuan supervisi, dan ekspor Excel identik template.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v3 · Prisma 6 · PostgreSQL 16 · Framer Motion. Auth JWT (cookie httpOnly) + bcrypt, RBAC 3 peran (Super Admin / User / Supervisi).

---

## Pengembangan Lokal

Prasyarat: Node 20+, PostgreSQL 16.

```bash
npm install
cp .env.example .env          # set DATABASE_URL & AUTH_SECRET
npx prisma migrate dev        # buat skema
npx prisma db seed            # master + user awal
npm run dev                   # http://localhost:3000
```

Perintah lain: `npm test` (Vitest), `npm run lint`, `npm run build`.

> User awal (seed): `mtr1`–`mtr5` (petugas), `tio` & `berto` (supervisi), `superadmin`. **Password awal = username.** Segera ganti lewat menu Setting.

---

## Deploy Final — Docker Compose di Proxmox

Di VM Proxmox (Docker + Docker Compose + git terpasang):

### 1. Ambil kode & atur rahasia

```bash
git clone <repo-url> mtr-report && cd mtr-report
```

Edit `docker-compose.yml` → ganti `AUTH_SECRET` dengan nilai acak, dan (opsional) kredensial DB:

```bash
openssl rand -base64 32        # tempel hasilnya ke AUTH_SECRET
```

### 2. Build image

```bash
docker compose build
```

### 3. Jalankan database lebih dulu

```bash
docker compose up -d db
```

### 4. Terapkan migrasi & seed (sekali saja)

Image aplikasi (standalone) tidak menyertakan Prisma CLI, jadi jalankan migrasi
via kontainer tooling sekali pakai pada jaringan compose:

```bash
docker run --rm --network mtr-report_default \
  -v "$PWD":/app -w /app \
  -e DATABASE_URL="postgresql://mtr_user:mtr_pass@db:5432/mtr_report_db?schema=public" \
  node:20-alpine sh -c "npm ci && npx prisma migrate deploy && npx prisma db seed"
```

> Nama jaringan biasanya `mtr-report_default` (sesuai nama folder). Cek dengan
> `docker network ls` bila berbeda. Alternatif: karena port 5432 dipublikasi ke
> host, migrasi juga bisa dijalankan dari host (jika ada Node) dengan
> `DATABASE_URL=...@localhost:5432/...`.

### 5. Jalankan aplikasi

```bash
docker compose up -d app
```

Akses `http://<ip-vm>:3000`. Login `superadmin` / `superadmin`, lalu **segera ganti semua password** di menu Setting.

### Catatan operasional

- **Media unggahan** (foto profil & tanda tangan) disimpan di `./public/uploads`
  dan dipertahankan lewat volume `./public:/app/public` di `docker-compose.yml`.
  Sertakan folder ini dalam rutinitas backup.
- **Backup database**: volume `postgres_data`. Mis. `docker compose exec db pg_dump -U mtr_user mtr_report_db > backup.sql`.
- **TLS / domain**: letakkan di belakang reverse proxy (Nginx/Caddy/Traefik) bila perlu HTTPS.
- **Update versi**: `git pull && docker compose build && docker compose up -d`, lalu ulangi langkah migrasi (4) bila ada migrasi baru.
