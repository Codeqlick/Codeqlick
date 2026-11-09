-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");
