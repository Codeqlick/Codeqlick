-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "analytics_share_hash" VARCHAR(64),
ADD COLUMN     "analytics_share_sealed" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cloud_projects_analytics_share_hash_key" ON "cloud_projects"("analytics_share_hash");
