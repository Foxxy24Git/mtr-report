-- CreateEnum
CREATE TYPE "RevisiStatus" AS ENUM ('menunggu_petugas', 'menunggu_verifikasi', 'selesai');

-- CreateEnum
CREATE TYPE "RevisiEventType" AS ENUM ('diminta', 'direvisi_petugas', 'ditolak_lagi', 'diterima');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'revisi_diminta';
ALTER TYPE "NotificationType" ADD VALUE 'revisi_disubmit';

-- CreateTable
CREATE TABLE "activity_revision_requests" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "status" "RevisiStatus" NOT NULL DEFAULT 'menunggu_petugas',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "activity_revision_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_revision_events" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "type" "RevisiEventType" NOT NULL,
    "by_user" TEXT NOT NULL,
    "catatan" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_revision_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_revision_requests_activity_id_idx" ON "activity_revision_requests"("activity_id");

-- CreateIndex
CREATE INDEX "activity_revision_requests_ticket_id_status_idx" ON "activity_revision_requests"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "activity_revision_events_request_id_idx" ON "activity_revision_events"("request_id");

-- AddForeignKey
ALTER TABLE "activity_revision_requests" ADD CONSTRAINT "activity_revision_requests_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "ticket_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_revision_requests" ADD CONSTRAINT "activity_revision_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_revision_requests" ADD CONSTRAINT "activity_revision_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_revision_requests" ADD CONSTRAINT "activity_revision_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_revision_events" ADD CONSTRAINT "activity_revision_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "activity_revision_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_revision_events" ADD CONSTRAINT "activity_revision_events_by_user_fkey" FOREIGN KEY ("by_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
