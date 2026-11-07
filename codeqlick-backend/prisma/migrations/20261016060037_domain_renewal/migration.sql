-- CreateEnum
CREATE TYPE "DomainSource" AS ENUM ('RDAP', 'MANUAL');

-- AlterTable
ALTER TABLE "client_projects" ADD COLUMN     "domain_checked_at" TIMESTAMPTZ(3),
ADD COLUMN     "domain_expires_at" DATE,
ADD COLUMN     "domain_name" TEXT,
ADD COLUMN     "domain_source" "DomainSource" NOT NULL DEFAULT 'RDAP',
ADD COLUMN     "domain_warned_for" TEXT;
