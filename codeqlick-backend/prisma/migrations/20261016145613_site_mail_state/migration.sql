-- CreateEnum
CREATE TYPE "SiteMailState" AS ENUM ('NONE', 'OVH', 'OTHER');

-- AlterTable
ALTER TABLE "managed_sites" ADD COLUMN     "mail_state" "SiteMailState";
