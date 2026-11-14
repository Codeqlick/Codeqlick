-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "newsletter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "newsletter_sent_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'PENDING',
    "confirm_token_hash" TEXT,
    "confirm_expires_at" TIMESTAMPTZ(3),
    "confirm_sent_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "unsubscribe_token" TEXT NOT NULL,
    "unsubscribed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_confirm_token_hash_key" ON "newsletter_subscribers"("confirm_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_key" ON "newsletter_subscribers"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_created_at_idx" ON "newsletter_subscribers"("status", "created_at");

-- Posts already live are never emailed (and say so); scheduled ones still go out.
UPDATE "posts" SET "newsletter_sent_at" = now(), "newsletter" = false WHERE "status" = 'PUBLISHED' AND "published_at" <= now();
