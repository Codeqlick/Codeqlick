-- CreateEnum
CREATE TYPE "CloudProtection" AS ENUM ('OFF', 'PREVIEWS', 'ALL');

-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "protection" "CloudProtection" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "protection_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "protection_hash" TEXT,
ADD COLUMN     "protection_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "protection_version" INTEGER NOT NULL DEFAULT 0;
