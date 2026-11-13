-- AlterTable
ALTER TABLE "cloud_teams" ADD COLUMN     "analytics_over_limit_month" VARCHAR(7);

-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "analytics" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cloud_analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "referrer" VARCHAR(100),
    "campaign" VARCHAR(60),
    "browser" VARCHAR(20) NOT NULL,
    "os" VARCHAR(20) NOT NULL,
    "device" VARCHAR(10) NOT NULL,
    "visitor" CHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_analytics_salts" (
    "day" VARCHAR(10) NOT NULL,
    "salt" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_analytics_salts_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "cloud_kv_entries" (
    "project_id" UUID NOT NULL,
    "key" VARCHAR(256) NOT NULL,
    "value" JSONB NOT NULL,
    "size" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_kv_entries_pkey" PRIMARY KEY ("project_id","key")
);

-- CreateIndex
CREATE INDEX "cloud_analytics_events_project_id_created_at_idx" ON "cloud_analytics_events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_analytics_events_team_id_created_at_idx" ON "cloud_analytics_events"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_kv_entries_expires_at_idx" ON "cloud_kv_entries"("expires_at");

-- AddForeignKey
ALTER TABLE "cloud_analytics_events" ADD CONSTRAINT "cloud_analytics_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_kv_entries" ADD CONSTRAINT "cloud_kv_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

