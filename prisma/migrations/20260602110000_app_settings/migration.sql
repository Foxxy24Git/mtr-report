-- Pengaturan aplikasi generik (key/value). Dipakai untuk logo_url (logo
-- aplikasi yang diunggah Super Admin). value NULL = pakai logo default.

CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default: logo_url kosong (pakai logo default aplikasi).
INSERT INTO "app_settings" ("id", "key", "value", "updated_at")
VALUES ('seed_logo_url', 'logo_url', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
