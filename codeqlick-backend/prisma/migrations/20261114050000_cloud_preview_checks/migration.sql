-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "preview_checks" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cloud_builds" ADD COLUMN     "audit_id" UUID;

-- AddForeignKey
ALTER TABLE "cloud_builds" ADD CONSTRAINT "cloud_builds_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "cloud_audits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "cloud_builds_audit_id_idx" ON "cloud_builds"("audit_id");
