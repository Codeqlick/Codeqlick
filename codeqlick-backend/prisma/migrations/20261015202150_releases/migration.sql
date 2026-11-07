-- CreateEnum
CREATE TYPE "ReleaseEnvironment" AS ENUM ('STAGING', 'PRODUCTION');

-- AlterTable
ALTER TABLE "client_projects" ADD COLUMN     "release_token_created_at" TIMESTAMPTZ(3),
ADD COLUMN     "release_token_hash" TEXT;

-- AlterTable
ALTER TABLE "project_updates" ADD COLUMN     "environment" "ReleaseEnvironment",
ADD COLUMN     "url" TEXT,
ADD COLUMN     "version" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_release_token_hash_key" ON "client_projects"("release_token_hash");

