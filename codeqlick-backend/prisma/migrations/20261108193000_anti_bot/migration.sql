-- AlterTable
ALTER TABLE "videochat_active_days" ADD COLUMN     "calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "short_calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skipped_fast" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "suspicion_cleared_at" TIMESTAMPTZ(3);
