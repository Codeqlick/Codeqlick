-- CreateEnum
CREATE TYPE "CloudRebuildFrequency" AS ENUM ('OFF', 'HOURLY', 'DAILY', 'WEEKLY');

-- AlterEnum
ALTER TYPE "CloudBuildTrigger" ADD VALUE 'SCHEDULE';

-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "rebuild_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rebuild_frequency" "CloudRebuildFrequency" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "rebuild_hour" INTEGER,
ADD COLUMN     "rebuild_minute" INTEGER,
ADD COLUMN     "rebuild_next_at" TIMESTAMPTZ(3),
ADD COLUMN     "rebuild_weekday" INTEGER;

-- CreateIndex
CREATE INDEX "cloud_projects_rebuild_next_at_idx" ON "cloud_projects"("rebuild_next_at");
