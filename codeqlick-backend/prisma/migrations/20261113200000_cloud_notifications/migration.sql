-- CreateEnum
CREATE TYPE "CloudNotifyKind" AS ENUM ('EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK');
-- CreateTable
CREATE TABLE "cloud_notify_channels" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "CloudNotifyKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "url_sealed" TEXT,
    "url_hint" VARCHAR(120),
    "secret_sealed" TEXT,
    "recipient_ids" UUID[],
    "build_failed" BOOLEAN NOT NULL DEFAULT true,
    "build_succeeded" BOOLEAN NOT NULL DEFAULT false,
    "previews" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(2) NOT NULL DEFAULT 'en',
    "failures" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMPTZ(3),
    "last_ok" BOOLEAN,
    "last_error" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "cloud_notify_channels_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "cloud_notify_channels_project_id_idx" ON "cloud_notify_channels"("project_id");
-- AddForeignKey
ALTER TABLE "cloud_notify_channels" ADD CONSTRAINT "cloud_notify_channels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
