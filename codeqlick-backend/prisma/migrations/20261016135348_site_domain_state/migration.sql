-- CreateEnum
CREATE TYPE "SiteDomainState" AS ENUM ('UNREGISTERED', 'ELSEWHERE', 'LIVE');

-- AlterEnum
ALTER TYPE "DomainSource" ADD VALUE 'OVH';

-- AlterTable
ALTER TABLE "managed_sites" ADD COLUMN     "domain_checked_at" TIMESTAMPTZ(3),
ADD COLUMN     "domain_state" "SiteDomainState";
