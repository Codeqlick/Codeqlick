-- CreateEnum
CREATE TYPE "CloudStatusNoticeKind" AS ENUM ('INCIDENT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "CloudStatusNoticeState" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "cloud_status_notices" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "kind" "CloudStatusNoticeKind" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "state" "CloudStatusNoticeState" NOT NULL,
    "monitor_ids" UUID[],
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_status_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_status_notice_updates" (
    "id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "state" "CloudStatusNoticeState",
    "body" VARCHAR(2000) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_status_notice_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cloud_status_notices_team_id_resolved_at_idx" ON "cloud_status_notices"("team_id", "resolved_at");

-- CreateIndex
CREATE INDEX "cloud_status_notices_team_id_created_at_idx" ON "cloud_status_notices"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_status_notice_updates_notice_id_created_at_idx" ON "cloud_status_notice_updates"("notice_id", "created_at");

-- AddForeignKey
ALTER TABLE "cloud_status_notices" ADD CONSTRAINT "cloud_status_notices_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_notices" ADD CONSTRAINT "cloud_status_notices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_notice_updates" ADD CONSTRAINT "cloud_status_notice_updates_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "cloud_status_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_notice_updates" ADD CONSTRAINT "cloud_status_notice_updates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
