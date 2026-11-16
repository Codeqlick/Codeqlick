-- CreateEnum
CREATE TYPE "CruisingPrepStatus" AS ENUM ('ON_PREP', 'NOT_ON_PREP');

-- CreateEnum
CREATE TYPE "CruisingContactStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED');

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "health_consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "health_reminded_at" TIMESTAMPTZ(3),
ADD COLUMN     "health_visible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_tested_month" VARCHAR(7),
ADD COLUMN     "prep_status" "CruisingPrepStatus",
ADD COLUMN     "reminder_months" INTEGER;

-- CreateTable
CREATE TABLE "cruising_trusted_contacts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(40) NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "status" "CruisingContactStatus" NOT NULL DEFAULT 'PENDING',
    "invite_token_hash" VARCHAR(64),
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_trusted_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_timers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "message" VARCHAR(200),
    "spot_id" UUID,
    "warned_at" TIMESTAMPTZ(3),
    "fired_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_timers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_health_centers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "lat" DECIMAL(8,5) NOT NULL,
    "lng" DECIMAL(8,5) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "city_slug" VARCHAR(100) NOT NULL,
    "url" VARCHAR(300),
    "phone" VARCHAR(40),
    "free" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "rapid" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cruising_health_centers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cruising_trusted_contacts_invite_token_hash_key" ON "cruising_trusted_contacts"("invite_token_hash");

-- CreateIndex
CREATE INDEX "cruising_trusted_contacts_user_id_created_at_idx" ON "cruising_trusted_contacts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_timers_user_id_ended_at_fired_at_idx" ON "cruising_timers"("user_id", "ended_at", "fired_at");

-- CreateIndex
CREATE INDEX "cruising_timers_ends_at_idx" ON "cruising_timers"("ends_at");

-- CreateIndex
CREATE INDEX "cruising_timers_spot_id_idx" ON "cruising_timers"("spot_id");

-- CreateIndex
CREATE INDEX "cruising_health_centers_country_code_city_slug_idx" ON "cruising_health_centers"("country_code", "city_slug");

-- CreateIndex
CREATE INDEX "cruising_health_centers_lat_lng_idx" ON "cruising_health_centers"("lat", "lng");

-- CreateIndex
CREATE INDEX "cruising_profiles_reminder_months_idx" ON "cruising_profiles"("reminder_months");

-- AddForeignKey
ALTER TABLE "cruising_trusted_contacts" ADD CONSTRAINT "cruising_trusted_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_timers" ADD CONSTRAINT "cruising_timers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_timers" ADD CONSTRAINT "cruising_timers_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

