-- CreateEnum
CREATE TYPE "CloudAuditKind" AS ENUM ('MANUAL', 'PREVIEW', 'SCHEDULED');

-- AlterTable
ALTER TABLE "cloud_audits" ADD COLUMN     "kind" "CloudAuditKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "production_check_next_at" TIMESTAMPTZ(3),
ADD COLUMN     "production_checks" BOOLEAN NOT NULL DEFAULT false;

-- Preview checks (decision 69) had no member: they are the audits with no user. Their project is
-- the one of the build that made them.
UPDATE "cloud_audits" SET "kind" = 'PREVIEW' WHERE "user_id" IS NULL;

UPDATE "cloud_audits" AS a
SET "project_id" = b."project_id"
FROM "cloud_builds" AS b
WHERE b."audit_id" = a."id" AND a."kind" = 'PREVIEW';

-- CreateIndex
CREATE INDEX "cloud_audits_kind_created_at_idx" ON "cloud_audits"("kind", "created_at");

-- CreateIndex
CREATE INDEX "cloud_audits_project_id_kind_created_at_idx" ON "cloud_audits"("project_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "cloud_projects_production_check_next_at_idx" ON "cloud_projects"("production_check_next_at");

-- AddForeignKey
ALTER TABLE "cloud_audits" ADD CONSTRAINT "cloud_audits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
