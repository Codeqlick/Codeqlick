-- CreateEnum
CREATE TYPE "CruisingSpotType" AS ENUM ('BEACH', 'PARK', 'FOREST', 'REST_AREA', 'SAUNA', 'BAR_CLUB', 'CINEMA', 'OTHER');

-- CreateEnum
CREATE TYPE "CruisingSpotStatus" AS ENUM ('PENDING', 'LIVE', 'REJECTED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "CruisingReviewStatus" AS ENUM ('LIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CruisingReportTarget" AS ENUM ('SPOT', 'REVIEW', 'PROFILE', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "CruisingReportReason" AS ENUM ('MINOR', 'ILLEGAL', 'DANGER', 'WRONG_INFO', 'HARASSMENT', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "CruisingReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "CruisingTakedownStatus" AS ENUM ('OPEN', 'REMOVED', 'CLOSED');

-- CreateTable
CREATE TABLE "cruising_profiles" (
    "user_id" UUID NOT NULL,
    "birth_year" INTEGER NOT NULL,
    "terms_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "email_alerts" BOOLEAN NOT NULL DEFAULT true,
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_until" TIMESTAMPTZ(3),
    "suspension_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cruising_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "cruising_spots" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "CruisingSpotType" NOT NULL,
    "lat" DECIMAL(8,5) NOT NULL,
    "lng" DECIMAL(8,5) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "city_slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "best_times" VARCHAR(200),
    "status" "CruisingSpotStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" VARCHAR(500),
    "created_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cruising_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_reviews" (
    "id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" VARCHAR(1000),
    "status" "CruisingReviewStatus" NOT NULL DEFAULT 'LIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cruising_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "CruisingReportTarget" NOT NULL,
    "spot_id" UUID,
    "review_id" UUID,
    "reported_id" UUID,
    "reason" "CruisingReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "status" "CruisingReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_takedowns" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "spot_link" VARCHAR(300),
    "spot_id" UUID,
    "reason" "CruisingReportReason" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "status" "CruisingTakedownStatus" NOT NULL DEFAULT 'OPEN',
    "response" VARCHAR(2000),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_takedowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cruising_spots_slug_key" ON "cruising_spots"("slug");

-- CreateIndex
CREATE INDEX "cruising_spots_status_lat_idx" ON "cruising_spots"("status", "lat");

-- CreateIndex
CREATE INDEX "cruising_spots_country_code_city_slug_status_idx" ON "cruising_spots"("country_code", "city_slug", "status");

-- CreateIndex
CREATE INDEX "cruising_spots_created_by_id_created_at_idx" ON "cruising_spots"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_reviews_spot_id_status_created_at_idx" ON "cruising_reviews"("spot_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "cruising_reviews_user_id_updated_at_idx" ON "cruising_reviews"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "cruising_reviews_spot_id_user_id_key" ON "cruising_reviews"("spot_id", "user_id");

-- CreateIndex
CREATE INDEX "cruising_reports_status_created_at_idx" ON "cruising_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "cruising_reports_reporter_id_created_at_idx" ON "cruising_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_reports_reported_id_idx" ON "cruising_reports"("reported_id");

-- CreateIndex
CREATE INDEX "cruising_reports_spot_id_idx" ON "cruising_reports"("spot_id");

-- CreateIndex
CREATE INDEX "cruising_reports_review_id_idx" ON "cruising_reports"("review_id");

-- CreateIndex
CREATE INDEX "cruising_takedowns_status_created_at_idx" ON "cruising_takedowns"("status", "created_at");

-- CreateIndex
CREATE INDEX "cruising_takedowns_spot_id_idx" ON "cruising_takedowns"("spot_id");

-- AddForeignKey
ALTER TABLE "cruising_profiles" ADD CONSTRAINT "cruising_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_spots" ADD CONSTRAINT "cruising_spots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reviews" ADD CONSTRAINT "cruising_reviews_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reviews" ADD CONSTRAINT "cruising_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "cruising_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_takedowns" ADD CONSTRAINT "cruising_takedowns_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_takedowns" ADD CONSTRAINT "cruising_takedowns_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
