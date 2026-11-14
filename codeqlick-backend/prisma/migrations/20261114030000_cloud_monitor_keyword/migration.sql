-- CreateEnum
CREATE TYPE "CloudMonitorKeywordMode" AS ENUM ('CONTAINS', 'NOT_CONTAINS');

-- AlterTable
ALTER TABLE "cloud_monitors" ADD COLUMN     "keyword" VARCHAR(100),
ADD COLUMN     "keyword_mode" "CloudMonitorKeywordMode" NOT NULL DEFAULT 'CONTAINS';
