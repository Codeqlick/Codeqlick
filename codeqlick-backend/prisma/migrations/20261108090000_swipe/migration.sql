-- CreateEnum
CREATE TYPE "SwipeGender" AS ENUM ('WOMAN', 'MAN', 'NONBINARY');

-- CreateEnum
CREATE TYPE "SwipeVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SwipePhotoStatus" AS ENUM ('PENDING', 'LIVE', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "SwipeReportReason" AS ENUM ('MINOR', 'NON_CONSENSUAL', 'STOLEN', 'ILLEGAL', 'HARASSMENT', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "SwipeReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "SwipeTakedownStatus" AS ENUM ('OPEN', 'REMOVED', 'CLOSED');

-- CreateTable
CREATE TABLE "swipe_profiles" (
    "user_id" UUID NOT NULL,
    "adult_confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "terms_version" TEXT NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "nickname" TEXT,
    "gender" "SwipeGender",
    "seeking" "SwipeGender"[] DEFAULT ARRAY[]::"SwipeGender"[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verification_status" "SwipeVerificationStatus" NOT NULL DEFAULT 'NONE',
    "verification_key" TEXT,
    "verification_note" TEXT,
    "verification_sent_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_until" TIMESTAMPTZ(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "swipe_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "swipe_photos" (
    "id" UUID NOT NULL,
    "ref" VARCHAR(12) NOT NULL,
    "owner_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "hash" VARCHAR(16) NOT NULL,
    "status" "SwipePhotoStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipe_votes" (
    "voter_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "like" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_votes_pkey" PRIMARY KEY ("voter_id","photo_id")
);

-- CreateTable
CREATE TABLE "swipe_matches" (
    "id" UUID NOT NULL,
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "read_a_at" TIMESTAMPTZ(3),
    "read_b_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipe_messages" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipe_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reported_id" UUID NOT NULL,
    "photo_id" UUID,
    "reason" "SwipeReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "status" "SwipeReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipe_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "swipe_takedowns" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "photo_ref" VARCHAR(40),
    "photo_id" UUID,
    "reason" "SwipeReportReason" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'ES',
    "status" "SwipeTakedownStatus" NOT NULL DEFAULT 'OPEN',
    "response" VARCHAR(2000),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_takedowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipe_blocked_hashes" (
    "hash" VARCHAR(16) NOT NULL,
    "reason" "SwipeReportReason" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_blocked_hashes_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "swipe_profiles_verification_status_verification_sent_at_idx" ON "swipe_profiles"("verification_status", "verification_sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "swipe_photos_ref_key" ON "swipe_photos"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "swipe_photos_storage_key_key" ON "swipe_photos"("storage_key");

-- CreateIndex
CREATE INDEX "swipe_photos_status_created_at_idx" ON "swipe_photos"("status", "created_at");

-- CreateIndex
CREATE INDEX "swipe_photos_owner_id_created_at_idx" ON "swipe_photos"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "swipe_votes_voter_id_owner_id_like_idx" ON "swipe_votes"("voter_id", "owner_id", "like");

-- CreateIndex
CREATE INDEX "swipe_matches_user_b_id_idx" ON "swipe_matches"("user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "swipe_matches_user_a_id_user_b_id_key" ON "swipe_matches"("user_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "swipe_messages_match_id_created_at_idx" ON "swipe_messages"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "swipe_reports_status_created_at_idx" ON "swipe_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "swipe_reports_reported_id_idx" ON "swipe_reports"("reported_id");

-- CreateIndex
CREATE INDEX "swipe_blocks_blocked_id_idx" ON "swipe_blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "swipe_takedowns_status_created_at_idx" ON "swipe_takedowns"("status", "created_at");

-- AddForeignKey
ALTER TABLE "swipe_profiles" ADD CONSTRAINT "swipe_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_photos" ADD CONSTRAINT "swipe_photos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_photos" ADD CONSTRAINT "swipe_photos_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_votes" ADD CONSTRAINT "swipe_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_votes" ADD CONSTRAINT "swipe_votes_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "swipe_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_matches" ADD CONSTRAINT "swipe_matches_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_matches" ADD CONSTRAINT "swipe_matches_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_messages" ADD CONSTRAINT "swipe_messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "swipe_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_messages" ADD CONSTRAINT "swipe_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_reports" ADD CONSTRAINT "swipe_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_reports" ADD CONSTRAINT "swipe_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_reports" ADD CONSTRAINT "swipe_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_reports" ADD CONSTRAINT "swipe_reports_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "swipe_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_blocks" ADD CONSTRAINT "swipe_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_blocks" ADD CONSTRAINT "swipe_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_takedowns" ADD CONSTRAINT "swipe_takedowns_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "swipe_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_takedowns" ADD CONSTRAINT "swipe_takedowns_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

