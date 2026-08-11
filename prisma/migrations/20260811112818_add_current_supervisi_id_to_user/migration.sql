-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_supervisi_id" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_current_supervisi_id_fkey" FOREIGN KEY ("current_supervisi_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
