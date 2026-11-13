-- AlterEnum
ALTER TYPE "CloudBuildTrigger" ADD VALUE 'HOOK';

-- AlterTable
ALTER TABLE "cloud_builds" ADD COLUMN     "hook_name" VARCHAR(60);

-- CreateTable
CREATE TABLE "cloud_deploy_hooks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "branch" VARCHAR(200) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_by_id" UUID,
    "last_called_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_deploy_hooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_deploy_hooks_token_hash_key" ON "cloud_deploy_hooks"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_deploy_hooks_project_id_name_key" ON "cloud_deploy_hooks"("project_id", "name");

-- AddForeignKey
ALTER TABLE "cloud_deploy_hooks" ADD CONSTRAINT "cloud_deploy_hooks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_deploy_hooks" ADD CONSTRAINT "cloud_deploy_hooks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
