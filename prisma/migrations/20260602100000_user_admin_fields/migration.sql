-- Tambah kolom Super Admin pada tabel users:
-- soft delete (is_aktif) + jejak login/shift aktif untuk tabel Member.

ALTER TABLE "users" ADD COLUMN "is_aktif" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "last_login" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "current_shift" "ShiftKode";
ALTER TABLE "users" ADD COLUMN "shift_started_at" TIMESTAMP(3);
