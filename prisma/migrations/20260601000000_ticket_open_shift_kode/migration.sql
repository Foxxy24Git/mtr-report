-- Shift asal (immutable) untuk kriteria laporan harian/shift.
-- FIX: tiket tetap muncul di laporan shift asal walau shift_kode current
-- dimutasi ke shift berikutnya saat serah terima.

-- 1. Tambah kolom (nullable dulu agar bisa backfill baris lama).
ALTER TABLE "tickets" ADD COLUMN "open_shift_kode" "ShiftKode";

-- 2. Backfill baris lama dari shift_kode current (best-effort: tiket yang
--    sudah ter-handover memakai shift current sebagai shift asal).
UPDATE "tickets" SET "open_shift_kode" = "shift_kode" WHERE "open_shift_kode" IS NULL;

-- 3. Jadikan wajib setelah backfill.
ALTER TABLE "tickets" ALTER COLUMN "open_shift_kode" SET NOT NULL;

-- 4. Index untuk query laporan.
CREATE INDEX "tickets_open_shift_kode_idx" ON "tickets"("open_shift_kode");
