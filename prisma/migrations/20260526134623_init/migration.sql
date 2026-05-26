-- CreateEnum
CREATE TYPE "Role" AS ENUM ('superadmin', 'user', 'supervisi');

-- CreateEnum
CREATE TYPE "LeaderJabatan" AS ENUM ('infrastruktur', 'divisi');

-- CreateEnum
CREATE TYPE "LookupTipe" AS ENUM ('jenis_gangguan', 'sumber_penyebab', 'jenis_penanganan');

-- CreateEnum
CREATE TYPE "TicketKategori" AS ENUM ('atm', 'jaringan');

-- CreateEnum
CREATE TYPE "CpTipe" AS ENUM ('pic', 'wag');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('proses', 'selesai');

-- CreateEnum
CREATE TYPE "StatusSupervisi" AS ENUM ('belum', 'approved');

-- CreateEnum
CREATE TYPE "ShiftKode" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "ServerFase" AS ENUM ('awal', 'akhir');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'user',
    "password_hash" TEXT NOT NULL,
    "foto_profil_url" TEXT,
    "ttd_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaders" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "jabatan" "LeaderJabatan" NOT NULL,
    "is_pjs" BOOLEAN NOT NULL DEFAULT false,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leaders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atm_master" (
    "id" TEXT NOT NULL,
    "kode_atm" TEXT NOT NULL,
    "nama_atm" TEXT NOT NULL,
    "cabang" TEXT,
    "alamat" TEXT,
    "vendor_atm" TEXT,
    "vendor_jaringan" TEXT,

    CONSTRAINT "atm_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_lookup" (
    "id" TEXT NOT NULL,
    "tipe" "LookupTipe" NOT NULL,
    "nilai" TEXT NOT NULL,

    CONSTRAINT "master_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "no_tiket" TEXT NOT NULL,
    "kategori" "TicketKategori" NOT NULL,
    "atm_id" TEXT,
    "waktu_open" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waktu_respon_internal" TIMESTAMP(3),
    "cp_tipe" "CpTipe",
    "cp_nama" TEXT,
    "cp_telp" TEXT,
    "jenis_gangguan" TEXT,
    "sumber_penyebab" TEXT,
    "metode_penanganan" TEXT,
    "vendor" TEXT,
    "no_tiket_vendor" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'proses',
    "waktu_selesai" TIMESTAMP(3),
    "status_supervisi" "StatusSupervisi" NOT NULL DEFAULT 'belum',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "pimpinan_infra_id" TEXT,
    "pimpinan_divisi_id" TEXT,
    "shift_kode" "ShiftKode" NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "keterangan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activities" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shift_kode" "ShiftKode" NOT NULL,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teks" TEXT NOT NULL,
    "is_tindak_lanjut_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_handovers" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "from_user" TEXT NOT NULL,
    "to_user" TEXT,
    "from_shift" "ShiftKode" NOT NULL,
    "to_shift" "ShiftKode" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_temp_logs" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "shift_kode" "ShiftKode" NOT NULL,
    "user_id" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "waktu_pantau" TIMESTAMP(3) NOT NULL,
    "suhu_room_server" TEXT,
    "suhu_panel" TEXT,
    "status_aktif_kiri" BOOLEAN NOT NULL DEFAULT true,
    "status_aktif_kanan" BOOLEAN NOT NULL DEFAULT true,
    "pantau_12jam_kiri" TEXT,
    "pantau_12jam_kanan" TEXT,

    CONSTRAINT "ac_temp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_logs" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "shift_kode" "ShiftKode" NOT NULL,
    "user_id" TEXT NOT NULL,
    "fase" "ServerFase" NOT NULL,
    "npay" TEXT,
    "aj_atmb" TEXT,
    "bifast" TEXT,
    "prima" TEXT,
    "cip_host" TEXT,

    CONSTRAINT "server_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "atm_master_kode_atm_key" ON "atm_master"("kode_atm");

-- CreateIndex
CREATE UNIQUE INDEX "master_lookup_tipe_nilai_key" ON "master_lookup"("tipe", "nilai");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_no_tiket_key" ON "tickets"("no_tiket");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_kategori_idx" ON "tickets"("kategori");

-- CreateIndex
CREATE INDEX "ticket_activities_ticket_id_idx" ON "ticket_activities"("ticket_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_atm_id_fkey" FOREIGN KEY ("atm_id") REFERENCES "atm_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pimpinan_infra_id_fkey" FOREIGN KEY ("pimpinan_infra_id") REFERENCES "leaders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pimpinan_divisi_id_fkey" FOREIGN KEY ("pimpinan_divisi_id") REFERENCES "leaders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_temp_logs" ADD CONSTRAINT "ac_temp_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_logs" ADD CONSTRAINT "server_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
