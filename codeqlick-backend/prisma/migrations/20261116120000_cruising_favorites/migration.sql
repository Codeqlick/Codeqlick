-- Cruising, phase 3: favourite spots, check-in alerts and Web Push (decision 85).

-- CreateEnum
CREATE TYPE "CruisingAlertChannel" AS ENUM ('PUSH', 'EMAIL');

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "favorite_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "favorite_emails" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cruising_favorites" (
    "user_id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_favorites_pkey" PRIMARY KEY ("user_id","spot_id")
);

-- CreateTable
CREATE TABLE "cruising_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "channel" "CruisingAlertChannel" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cruising_favorites_spot_id_idx" ON "cruising_favorites"("spot_id");

-- CreateIndex
CREATE INDEX "cruising_favorites_user_id_created_at_idx" ON "cruising_favorites"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_alerts_user_id_created_at_idx" ON "cruising_alerts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_alerts_spot_id_idx" ON "cruising_alerts"("spot_id");

-- CreateIndex
CREATE INDEX "cruising_alerts_created_at_idx" ON "cruising_alerts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cruising_push_subscriptions_endpoint_key" ON "cruising_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "cruising_push_subscriptions_user_id_created_at_idx" ON "cruising_push_subscriptions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "cruising_favorites" ADD CONSTRAINT "cruising_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_favorites" ADD CONSTRAINT "cruising_favorites_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_alerts" ADD CONSTRAINT "cruising_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_alerts" ADD CONSTRAINT "cruising_alerts_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_push_subscriptions" ADD CONSTRAINT "cruising_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

