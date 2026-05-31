-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "supervisi_id" TEXT;

-- CreateIndex
CREATE INDEX "tickets_supervisi_id_idx" ON "tickets"("supervisi_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_supervisi_id_fkey" FOREIGN KEY ("supervisi_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
