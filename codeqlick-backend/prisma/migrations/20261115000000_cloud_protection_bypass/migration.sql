-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "protection_bypass_created_at" TIMESTAMPTZ(3),
ADD COLUMN     "protection_bypass_created_by_id" UUID,
ADD COLUMN     "protection_bypass_hash" TEXT,
ADD COLUMN     "protection_bypass_last_used_at" TIMESTAMPTZ(3),
ADD COLUMN     "protection_bypass_prefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cloud_projects_protection_bypass_hash_key" ON "cloud_projects"("protection_bypass_hash");

-- AddForeignKey
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_protection_bypass_created_by_id_fkey" FOREIGN KEY ("protection_bypass_created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
