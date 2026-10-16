-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('UNKNOWN', 'UP', 'DOWN');

-- CreateTable
CREATE TABLE "site_monitors" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "SiteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "status_since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "cert_expires_at" TIMESTAMPTZ(3),
    "cert_checked_at" TIMESTAMPTZ(3),
    "cert_warned_for" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_checks" (
    "id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "response_ms" INTEGER,
    "error" TEXT,

    CONSTRAINT "site_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_monitors_project_id_key" ON "site_monitors"("project_id");

-- CreateIndex
CREATE INDEX "site_checks_monitor_id_checked_at_idx" ON "site_checks"("monitor_id", "checked_at");

-- AddForeignKey
ALTER TABLE "site_monitors" ADD CONSTRAINT "site_monitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_checks" ADD CONSTRAINT "site_checks_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "site_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
