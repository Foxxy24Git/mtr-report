-- AlterTable
ALTER TABLE "shift_reports" ADD COLUMN     "catatan_supervisi_next" TEXT,
ADD COLUMN     "supervisi_next_approved_at" TIMESTAMP(3),
ADD COLUMN     "supervisi_next_approved_by" TEXT;

-- CreateIndex
CREATE INDEX "shift_reports_supervisi_next_id_status_idx" ON "shift_reports"("supervisi_next_id", "status");

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_supervisi_next_approved_by_fkey" FOREIGN KEY ("supervisi_next_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
