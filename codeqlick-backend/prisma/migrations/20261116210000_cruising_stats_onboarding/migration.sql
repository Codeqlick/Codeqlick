-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "onboarding_done_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "cruising_messages_created_at_idx" ON "cruising_messages"("created_at");

-- CreateIndex
CREATE INDEX "cruising_reports_reviewed_at_idx" ON "cruising_reports"("reviewed_at");

