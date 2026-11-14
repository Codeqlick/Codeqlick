-- DropIndex
DROP INDEX "cloud_env_vars_project_id_key_key";

-- AlterTable
ALTER TABLE "cloud_env_vars" ADD COLUMN     "branch" VARCHAR(200) NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "cloud_env_vars_project_id_key_branch_key" ON "cloud_env_vars"("project_id", "key", "branch");
