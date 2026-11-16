-- CreateEnum
CREATE TYPE "CloudStatusSubscriberStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CloudStatusDispatchKind" AS ENUM ('NOTICE', 'UPDATE', 'RESOLVED', 'MAINTENANCE_STARTED');

-- AlterTable
ALTER TABLE "cloud_status_notices" ADD COLUMN     "start_notified_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "cloud_status_pages" ADD COLUMN     "email_window_start" TIMESTAMPTZ(3),
ADD COLUMN     "emails_in_window" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cloud_status_subscribers" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "status" "CloudStatusSubscriberStatus" NOT NULL DEFAULT 'PENDING',
    "confirm_token_hash" TEXT,
    "confirm_expires_at" TIMESTAMPTZ(3),
    "confirm_sent_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "unsubscribe_token" TEXT NOT NULL,
    "unsubscribed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_status_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_status_dispatches" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "update_id" UUID,
    "kind" "CloudStatusDispatchKind" NOT NULL,
    "cursor" UUID,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_status_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_status_subscribers_confirm_token_hash_key" ON "cloud_status_subscribers"("confirm_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_status_subscribers_unsubscribe_token_key" ON "cloud_status_subscribers"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "cloud_status_subscribers_team_id_status_idx" ON "cloud_status_subscribers"("team_id", "status");

-- CreateIndex
CREATE INDEX "cloud_status_subscribers_email_confirm_sent_at_idx" ON "cloud_status_subscribers"("email", "confirm_sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_status_subscribers_team_id_email_key" ON "cloud_status_subscribers"("team_id", "email");

-- CreateIndex
CREATE INDEX "cloud_status_dispatches_completed_at_created_at_idx" ON "cloud_status_dispatches"("completed_at", "created_at");

-- AddForeignKey
ALTER TABLE "cloud_status_subscribers" ADD CONSTRAINT "cloud_status_subscribers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_dispatches" ADD CONSTRAINT "cloud_status_dispatches_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_dispatches" ADD CONSTRAINT "cloud_status_dispatches_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "cloud_status_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_dispatches" ADD CONSTRAINT "cloud_status_dispatches_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "cloud_status_notice_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

