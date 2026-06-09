-- Integrasi Telegram (Fase 2): kolom chat ID & catatan nomor HP/WA pada users.
-- Diisi oleh Super Admin untuk akun Supervisi; nullable (default belum diset).

ALTER TABLE "users" ADD COLUMN "telegram_chat_id" TEXT;
ALTER TABLE "users" ADD COLUMN "telegram_nomor" TEXT;
