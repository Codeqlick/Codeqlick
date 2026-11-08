-- AlterTable
ALTER TABLE "swipe_matches" ADD COLUMN     "notified_a_at" TIMESTAMPTZ(3),
ADD COLUMN     "notified_b_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "swipe_photos" ADD COLUMN     "watermarked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "swipe_profiles" ADD COLUMN     "age_max" INTEGER NOT NULL DEFAULT 99,
ADD COLUMN     "age_min" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "bio" VARCHAR(160),
ADD COLUMN     "birth_year" INTEGER,
ADD COLUMN     "blur_photos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "email_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "same_country" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "swipe_votes" ADD COLUMN     "super_like" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "swipe_push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "swipe_push_subscriptions_endpoint_key" ON "swipe_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "swipe_push_subscriptions_user_id_idx" ON "swipe_push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "swipe_push_subscriptions" ADD CONSTRAINT "swipe_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
