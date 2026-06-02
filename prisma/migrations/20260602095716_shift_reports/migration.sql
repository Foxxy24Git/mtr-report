-- CreateTable
CREATE TABLE "shift_reports" (
    "id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "shift_kode" "ShiftKode" NOT NULL,
    "shift_label" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "receiver_user_id" TEXT,
    "supervisi_id" TEXT,
    "supervisi_next_id" TEXT,
    "pimpinan_infra_id" TEXT,
    "pimpinan_divisi_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "catatan_supervisi" TEXT,
    "handover_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_reports_shift_kode_tanggal_idx" ON "shift_reports"("shift_kode", "tanggal");

-- CreateIndex
CREATE INDEX "shift_reports_supervisi_id_status_idx" ON "shift_reports"("supervisi_id", "status");

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_supervisi_id_fkey" FOREIGN KEY ("supervisi_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_supervisi_next_id_fkey" FOREIGN KEY ("supervisi_next_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_pimpinan_infra_id_fkey" FOREIGN KEY ("pimpinan_infra_id") REFERENCES "leaders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_pimpinan_divisi_id_fkey" FOREIGN KEY ("pimpinan_divisi_id") REFERENCES "leaders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "shift_handovers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
