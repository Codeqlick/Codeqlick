-- CreateEnum
CREATE TYPE "CruisingSpotTag" AS ENUM ('NUDIST', 'DAY', 'NIGHT', 'PARKING', 'PUBLIC_TRANSPORT', 'HARD_ACCESS', 'LIT', 'SECLUDED', 'INDOOR', 'ACCESSIBLE', 'GLORY_HOLES', 'DARKROOM');

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "helpful_received" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviews_written" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spots_live" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "cruising_spots" ADD COLUMN     "hour_check_ins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hours_decayed_at" TIMESTAMPTZ(3),
ADD COLUMN     "opening_hours" VARCHAR(200),
ADD COLUMN     "tags" "CruisingSpotTag"[] DEFAULT ARRAY[]::"CruisingSpotTag"[],
ADD COLUMN     "time_zone" VARCHAR(64),
ADD COLUMN     "tips" VARCHAR(500);

-- CreateTable
CREATE TABLE "cruising_spot_hours" (
    "spot_id" UUID NOT NULL,
    "day" SMALLINT NOT NULL,
    "hour" SMALLINT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "cruising_spot_hours_pkey" PRIMARY KEY ("spot_id","day","hour")
);

-- CreateTable
CREATE TABLE "cruising_review_votes" (
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_review_votes_pkey" PRIMARY KEY ("review_id","user_id")
);

-- CreateIndex
CREATE INDEX "cruising_review_votes_user_id_idx" ON "cruising_review_votes"("user_id");

-- CreateIndex
CREATE INDEX "cruising_spots_tags_idx" ON "cruising_spots" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "cruising_spot_hours" ADD CONSTRAINT "cruising_spot_hours_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_review_votes" ADD CONSTRAINT "cruising_review_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "cruising_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_review_votes" ADD CONSTRAINT "cruising_review_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (decision 93): the badges' counters of the existing members. No votes exist yet, so
-- helpful_received stays 0. The spots' time zones are filled in by the API when it starts (they
-- come from a lookup of the coordinates, decision 89).
UPDATE "cruising_profiles" AS p
SET "spots_live" = (
      SELECT count(*) FROM "cruising_spots" AS s
      WHERE s."created_by_id" = p."user_id" AND s."status" = 'LIVE'
    ),
    "reviews_written" = (
      SELECT count(*) FROM "cruising_reviews" AS r
      WHERE r."user_id" = p."user_id" AND r."status" = 'LIVE'
    );
