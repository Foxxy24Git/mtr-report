-- AlterTable
ALTER TABLE "shift_handovers" ADD COLUMN     "pimpinan_divisi_id" TEXT,
ADD COLUMN     "pimpinan_infra_id" TEXT,
ADD COLUMN     "supervisi_id" TEXT,
ADD COLUMN     "supervisi_next_id" TEXT;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_pimpinan_infra_id_fkey" FOREIGN KEY ("pimpinan_infra_id") REFERENCES "leaders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_pimpinan_divisi_id_fkey" FOREIGN KEY ("pimpinan_divisi_id") REFERENCES "leaders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_supervisi_id_fkey" FOREIGN KEY ("supervisi_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_supervisi_next_id_fkey" FOREIGN KEY ("supervisi_next_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
