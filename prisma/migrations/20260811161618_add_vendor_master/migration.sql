-- CreateTable
CREATE TABLE "vendor_master" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_master_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_master_nama_key" ON "vendor_master"("nama");

-- Seed 5 vendor awal.
INSERT INTO "vendor_master" ("id", "nama", "created_at") VALUES
    ('seed_vendor_lintas_arta', 'Lintas Arta', CURRENT_TIMESTAMP),
    ('seed_vendor_telkom', 'Telkom', CURRENT_TIMESTAMP),
    ('seed_vendor_hyosung', 'Hyosung', CURRENT_TIMESTAMP),
    ('seed_vendor_ncr', 'NCR', CURRENT_TIMESTAMP),
    ('seed_vendor_ssi', 'SSI', CURRENT_TIMESTAMP)
ON CONFLICT ("nama") DO NOTHING;
