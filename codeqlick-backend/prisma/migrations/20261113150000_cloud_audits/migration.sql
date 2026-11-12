-- CreateTable
CREATE TABLE "cloud_audits" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID,
    "url" VARCHAR(2048) NOT NULL,
    "score" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cloud_audits_team_id_created_at_idx" ON "cloud_audits"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_audits_created_at_idx" ON "cloud_audits"("created_at");

-- AddForeignKey
ALTER TABLE "cloud_audits" ADD CONSTRAINT "cloud_audits_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
