-- CreateEnum
CREATE TYPE "CruisingNotificationKind" AS ENUM ('MESSAGE', 'WINK', 'VISITS', 'FAVORITE_ACTIVITY', 'MEETUP_PLANNED', 'MEETUP_CANCELLED', 'SAFETY_ALERT', 'ALBUM_SHARED', 'SPOT_PUBLISHED', 'SPOT_REJECTED', 'SPOT_REMOVED', 'MEDIA_REMOVED', 'VERIFICATION_DECIDED');

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "show_visits" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cruising_winks" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_winks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_profile_views" (
    "viewer_id" UUID NOT NULL,
    "viewed_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_profile_views_pkey" PRIMARY KEY ("viewer_id","viewed_id","day")
);

-- CreateTable
CREATE TABLE "cruising_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "CruisingNotificationKind" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "group_key" VARCHAR(80),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cruising_winks_sender_id_created_at_idx" ON "cruising_winks"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_winks_recipient_id_created_at_idx" ON "cruising_winks"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_winks_created_at_idx" ON "cruising_winks"("created_at");

-- CreateIndex
CREATE INDEX "cruising_profile_views_viewed_id_seen_at_idx" ON "cruising_profile_views"("viewed_id", "seen_at");

-- CreateIndex
CREATE INDEX "cruising_profile_views_day_idx" ON "cruising_profile_views"("day");

-- CreateIndex
CREATE INDEX "cruising_notifications_user_id_created_at_idx" ON "cruising_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_notifications_user_id_group_key_idx" ON "cruising_notifications"("user_id", "group_key");

-- CreateIndex
CREATE INDEX "cruising_notifications_created_at_idx" ON "cruising_notifications"("created_at");

-- AddForeignKey
ALTER TABLE "cruising_winks" ADD CONSTRAINT "cruising_winks_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_winks" ADD CONSTRAINT "cruising_winks_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_profile_views" ADD CONSTRAINT "cruising_profile_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_profile_views" ADD CONSTRAINT "cruising_profile_views_viewed_id_fkey" FOREIGN KEY ("viewed_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_notifications" ADD CONSTRAINT "cruising_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

