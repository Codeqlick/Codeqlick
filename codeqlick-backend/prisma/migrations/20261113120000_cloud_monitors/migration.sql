-- CreateEnum
CREATE TYPE "CloudMonitorKind" AS ENUM ('HTTP', 'HEARTBEAT');

-- CreateEnum
CREATE TYPE "CloudMonitorStatus" AS ENUM ('UNKNOWN', 'UP', 'DOWN', 'PAUSED');

-- CreateTable
CREATE TABLE "cloud_monitors" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "project_id" UUID,
    "name" VARCHAR(60) NOT NULL,
    "kind" "CloudMonitorKind" NOT NULL,
    "url" VARCHAR(2048),
    "key" VARCHAR(40),
    "period_minutes" INTEGER,
    "grace_minutes" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "CloudMonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
    "status_since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMPTZ(3),
    "last_ping_at" TIMESTAMPTZ(3),
    "deadline_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(300),
    "cert_expires_at" TIMESTAMPTZ(3),
    "cert_checked_at" TIMESTAMPTZ(3),
    "cert_warned_for" TIMESTAMPTZ(3),
    "alert_ids" UUID[],
    "last_down_alert_at" TIMESTAMPTZ(3),
    "last_up_alert_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_monitor_checks" (
    "id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "response_ms" INTEGER,
    "error" VARCHAR(300),

    CONSTRAINT "cloud_monitor_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_monitor_events" (
    "id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "status" "CloudMonitorStatus" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" VARCHAR(300),

    CONSTRAINT "cloud_monitor_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_status_pages" (
    "team_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(80) NOT NULL,
    "intro" VARCHAR(500),
    "items" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_status_pages_pkey" PRIMARY KEY ("team_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_monitors_key_key" ON "cloud_monitors"("key");

-- CreateIndex
CREATE INDEX "cloud_monitors_team_id_idx" ON "cloud_monitors"("team_id");

-- CreateIndex
CREATE INDEX "cloud_monitors_kind_enabled_last_checked_at_idx" ON "cloud_monitors"("kind", "enabled", "last_checked_at");

-- CreateIndex
CREATE INDEX "cloud_monitors_kind_enabled_deadline_at_idx" ON "cloud_monitors"("kind", "enabled", "deadline_at");

-- CreateIndex
CREATE INDEX "cloud_monitor_checks_monitor_id_checked_at_idx" ON "cloud_monitor_checks"("monitor_id", "checked_at");

-- CreateIndex
CREATE INDEX "cloud_monitor_checks_checked_at_idx" ON "cloud_monitor_checks"("checked_at");

-- CreateIndex
CREATE INDEX "cloud_monitor_events_monitor_id_at_idx" ON "cloud_monitor_events"("monitor_id", "at");

-- AddForeignKey
ALTER TABLE "cloud_monitors" ADD CONSTRAINT "cloud_monitors_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_monitor_checks" ADD CONSTRAINT "cloud_monitor_checks_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "cloud_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_monitor_events" ADD CONSTRAINT "cloud_monitor_events_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "cloud_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_status_pages" ADD CONSTRAINT "cloud_status_pages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
