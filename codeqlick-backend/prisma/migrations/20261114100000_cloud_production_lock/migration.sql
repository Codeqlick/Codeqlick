-- AlterTable
ALTER TABLE "cloud_builds" ADD COLUMN     "kept_as_preview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "production_locked_at" TIMESTAMPTZ(3),
ADD COLUMN     "production_locked_by_id" UUID;

-- AddForeignKey
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_production_locked_by_id_fkey" FOREIGN KEY ("production_locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
