-- CreateEnum
CREATE TYPE "CruisingVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CruisingMediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CruisingMediaStatus" AS ENUM ('PROCESSING', 'LIVE', 'HIDDEN', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CruisingReportReason" ADD VALUE 'NON_CONSENSUAL';
ALTER TYPE "CruisingReportReason" ADD VALUE 'STOLEN';

-- AlterEnum
ALTER TYPE "CruisingReportTarget" ADD VALUE 'MEDIA';

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "uploads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "uploads_since" TIMESTAMPTZ(3),
ADD COLUMN     "verification_key" TEXT,
ADD COLUMN     "verification_note" VARCHAR(500),
ADD COLUMN     "verification_sent_at" TIMESTAMPTZ(3),
ADD COLUMN     "verification_status" "CruisingVerificationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "verification_tries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verification_tries_since" TIMESTAMPTZ(3),
ADD COLUMN     "verified_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "cruising_reports" ADD COLUMN     "media_id" UUID;

-- AlterTable
ALTER TABLE "cruising_takedowns" ADD COLUMN     "media_id" UUID,
ADD COLUMN     "media_ref" VARCHAR(12);

-- CreateTable
CREATE TABLE "cruising_media" (
    "id" UUID NOT NULL,
    "ref" VARCHAR(12) NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "CruisingMediaKind" NOT NULL,
    "status" "CruisingMediaStatus" NOT NULL DEFAULT 'PROCESSING',
    "storage_key" TEXT,
    "poster_key" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "hash" VARCHAR(16),
    "failure" VARCHAR(300),
    "cover" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cruising_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_blocked_hashes" (
    "hash" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_blocked_hashes_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "cruising_media_ref_key" ON "cruising_media"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "cruising_media_storage_key_key" ON "cruising_media"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "cruising_media_poster_key_key" ON "cruising_media"("poster_key");

-- CreateIndex
CREATE INDEX "cruising_media_owner_id_position_idx" ON "cruising_media"("owner_id", "position");

-- CreateIndex
CREATE INDEX "cruising_media_owner_id_created_at_idx" ON "cruising_media"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_media_reviewed_at_created_at_idx" ON "cruising_media"("reviewed_at", "created_at");

-- CreateIndex
CREATE INDEX "cruising_media_status_idx" ON "cruising_media"("status");

-- CreateIndex
CREATE INDEX "cruising_profiles_verification_status_verification_sent_at_idx" ON "cruising_profiles"("verification_status", "verification_sent_at");

-- CreateIndex
CREATE INDEX "cruising_reports_media_id_idx" ON "cruising_reports"("media_id");

-- CreateIndex
CREATE INDEX "cruising_takedowns_media_id_idx" ON "cruising_takedowns"("media_id");

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "cruising_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_takedowns" ADD CONSTRAINT "cruising_takedowns_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "cruising_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_media" ADD CONSTRAINT "cruising_media_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_media" ADD CONSTRAINT "cruising_media_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

