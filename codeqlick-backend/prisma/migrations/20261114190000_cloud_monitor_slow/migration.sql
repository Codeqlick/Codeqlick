-- AlterTable
ALTER TABLE "cloud_monitors" ADD COLUMN     "slow_ms" INTEGER,
ADD COLUMN     "slow_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slow_since" TIMESTAMPTZ(3);
