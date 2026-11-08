-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "peak_alerts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "peak_notified_at" TIMESTAMPTZ(3);
