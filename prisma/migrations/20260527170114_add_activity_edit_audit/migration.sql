-- AlterTable
ALTER TABLE "ticket_activities" ADD COLUMN     "edited_at" TIMESTAMP(3),
ADD COLUMN     "edited_by" TEXT;

-- CreateTable
CREATE TABLE "ticket_activity_revisions" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "teks" TEXT NOT NULL,
    "waktu" TIMESTAMP(3) NOT NULL,
    "edited_by" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activity_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_activity_revisions_activity_id_idx" ON "ticket_activity_revisions"("activity_id");

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity_revisions" ADD CONSTRAINT "ticket_activity_revisions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "ticket_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
