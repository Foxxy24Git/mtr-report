-- Refactor tabel leaders: enum jabatan -> kategori, tambah jabatan (teks),
-- tipe (tetap|pjs), nama_pjs, is_aktif, created_at, updated_at.

-- 1. Rename enum LeaderJabatan -> LeaderKategori (nilai infrastruktur|divisi tetap)
ALTER TYPE "LeaderJabatan" RENAME TO "LeaderKategori";

-- 2. Enum baru untuk tipe pimpinan
CREATE TYPE "LeaderTipe" AS ENUM ('tetap', 'pjs');

-- 3. Kolom jabatan lama (enum) menjadi kategori
ALTER TABLE "leaders" RENAME COLUMN "jabatan" TO "kategori";

-- 4. Kolom jabatan baru (teks), backfill dari kategori
ALTER TABLE "leaders" ADD COLUMN "jabatan" TEXT NOT NULL DEFAULT '';
UPDATE "leaders" SET "jabatan" = CASE
  WHEN "kategori" = 'infrastruktur' THEN 'Pemimpin Bagian Infrastruktur TI'
  ELSE 'Pemimpin Divisi TI'
END;
ALTER TABLE "leaders" ALTER COLUMN "jabatan" DROP DEFAULT;

-- 5. Kolom tipe dari is_pjs
ALTER TABLE "leaders" ADD COLUMN "tipe" "LeaderTipe" NOT NULL DEFAULT 'tetap';
UPDATE "leaders" SET "tipe" = 'pjs' WHERE "is_pjs" = true;

-- 6. Nama PJS (nullable)
ALTER TABLE "leaders" ADD COLUMN "nama_pjs" TEXT;

-- 7. aktif -> is_aktif
ALTER TABLE "leaders" RENAME COLUMN "aktif" TO "is_aktif";

-- 8. Timestamp audit
ALTER TABLE "leaders" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "leaders" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 9. Buang kolom is_pjs lama
ALTER TABLE "leaders" DROP COLUMN "is_pjs";
