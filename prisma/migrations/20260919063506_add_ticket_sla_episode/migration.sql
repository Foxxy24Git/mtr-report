-- CreateEnum
CREATE TYPE "SlaEpisodeBasis" AS ENUM ('internal', 'eksternal');

-- CreateTable
CREATE TABLE "ticket_sla_episodes" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "basis" "SlaEpisodeBasis" NOT NULL,
    "mulai" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "catatan" TEXT,
    "dibuat_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_sla_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_sla_episodes_ticket_id_idx" ON "ticket_sla_episodes"("ticket_id");

-- AddForeignKey
ALTER TABLE "ticket_sla_episodes" ADD CONSTRAINT "ticket_sla_episodes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sla_episodes" ADD CONSTRAINT "ticket_sla_episodes_dibuat_oleh_id_fkey" FOREIGN KEY ("dibuat_oleh_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
