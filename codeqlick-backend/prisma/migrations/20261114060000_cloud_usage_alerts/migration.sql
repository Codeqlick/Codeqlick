-- CreateTable
CREATE TABLE "cloud_usage_alerts" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "key" VARCHAR(30) NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "percent" INTEGER NOT NULL,
    "used" BIGINT NOT NULL,
    "limit" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_usage_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cloud_usage_alerts_created_at_idx" ON "cloud_usage_alerts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_usage_alerts_team_id_key_period_key" ON "cloud_usage_alerts"("team_id", "key", "period");

-- AddForeignKey
ALTER TABLE "cloud_usage_alerts" ADD CONSTRAINT "cloud_usage_alerts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
