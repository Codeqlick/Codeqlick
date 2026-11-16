-- CreateEnum
CREATE TYPE "CruisingMeetupStatus" AS ENUM ('LIVE', 'HIDDEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CruisingSafetyKind" AS ENUM ('POLICE', 'THEFT', 'AGGRESSION', 'SURVEILLANCE', 'CLOSED', 'OTHER');

-- CreateEnum
CREATE TYPE "CruisingSafetyVoteKind" AS ENUM ('CONFIRM', 'GONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CruisingReportTarget" ADD VALUE 'MEETUP';
ALTER TYPE "CruisingReportTarget" ADD VALUE 'ALERT';

-- AlterTable
ALTER TABLE "cruising_reports" ADD COLUMN     "meetup_id" UUID,
ADD COLUMN     "safety_alert_id" UUID;

-- CreateTable
CREATE TABLE "cruising_meetups" (
    "id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER,
    "status" "CruisingMeetupStatus" NOT NULL DEFAULT 'LIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_meetups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_meetup_attendees" (
    "meetup_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_meetup_attendees_pkey" PRIMARY KEY ("meetup_id","user_id")
);

-- CreateTable
CREATE TABLE "cruising_trips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "city_slug" VARCHAR(100) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_safety_alerts" (
    "id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "poster_id" UUID,
    "kind" "CruisingSafetyKind" NOT NULL,
    "note" VARCHAR(200),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_safety_votes" (
    "alert_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "CruisingSafetyVoteKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_safety_votes_pkey" PRIMARY KEY ("alert_id","user_id")
);

-- CreateIndex
CREATE INDEX "cruising_meetups_spot_id_status_starts_at_idx" ON "cruising_meetups"("spot_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "cruising_meetups_host_id_created_at_idx" ON "cruising_meetups"("host_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_meetups_ends_at_idx" ON "cruising_meetups"("ends_at");

-- CreateIndex
CREATE INDEX "cruising_meetup_attendees_user_id_idx" ON "cruising_meetup_attendees"("user_id");

-- CreateIndex
CREATE INDEX "cruising_trips_country_code_city_slug_ends_on_idx" ON "cruising_trips"("country_code", "city_slug", "ends_on");

-- CreateIndex
CREATE INDEX "cruising_trips_user_id_ends_on_idx" ON "cruising_trips"("user_id", "ends_on");

-- CreateIndex
CREATE INDEX "cruising_trips_ends_on_idx" ON "cruising_trips"("ends_on");

-- CreateIndex
CREATE INDEX "cruising_safety_alerts_spot_id_expires_at_idx" ON "cruising_safety_alerts"("spot_id", "expires_at");

-- CreateIndex
CREATE INDEX "cruising_safety_alerts_poster_id_created_at_idx" ON "cruising_safety_alerts"("poster_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_safety_alerts_expires_at_idx" ON "cruising_safety_alerts"("expires_at");

-- CreateIndex
CREATE INDEX "cruising_safety_votes_user_id_idx" ON "cruising_safety_votes"("user_id");

-- CreateIndex
CREATE INDEX "cruising_reports_meetup_id_idx" ON "cruising_reports"("meetup_id");

-- CreateIndex
CREATE INDEX "cruising_reports_safety_alert_id_idx" ON "cruising_reports"("safety_alert_id");

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_meetup_id_fkey" FOREIGN KEY ("meetup_id") REFERENCES "cruising_meetups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_safety_alert_id_fkey" FOREIGN KEY ("safety_alert_id") REFERENCES "cruising_safety_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_meetups" ADD CONSTRAINT "cruising_meetups_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_meetups" ADD CONSTRAINT "cruising_meetups_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_meetup_attendees" ADD CONSTRAINT "cruising_meetup_attendees_meetup_id_fkey" FOREIGN KEY ("meetup_id") REFERENCES "cruising_meetups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_meetup_attendees" ADD CONSTRAINT "cruising_meetup_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_trips" ADD CONSTRAINT "cruising_trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_safety_alerts" ADD CONSTRAINT "cruising_safety_alerts_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_safety_alerts" ADD CONSTRAINT "cruising_safety_alerts_poster_id_fkey" FOREIGN KEY ("poster_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_safety_votes" ADD CONSTRAINT "cruising_safety_votes_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "cruising_safety_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_safety_votes" ADD CONSTRAINT "cruising_safety_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

