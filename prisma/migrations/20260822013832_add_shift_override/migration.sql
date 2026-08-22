-- CreateTable
CREATE TABLE "shift_overrides" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_overrides_tanggal_key" ON "shift_overrides"("tanggal");

-- AddForeignKey
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
