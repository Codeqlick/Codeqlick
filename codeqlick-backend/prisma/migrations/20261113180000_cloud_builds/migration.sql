-- CreateEnum
CREATE TYPE "CloudBuildTrigger" AS ENUM ('PUSH', 'PULL_REQUEST', 'MANUAL');

-- CreateEnum
CREATE TYPE "CloudBuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "cloud_projects" ADD COLUMN     "build_branches" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "build_command" VARCHAR(300) NOT NULL DEFAULT 'npm run build',
ADD COLUMN     "build_pull_requests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "git_branch" VARCHAR(200) NOT NULL DEFAULT 'main',
ADD COLUMN     "git_installation_id" BIGINT,
ADD COLUMN     "git_repo" VARCHAR(200),
ADD COLUMN     "git_repo_id" BIGINT,
ADD COLUMN     "install_command" VARCHAR(300) NOT NULL DEFAULT 'npm ci',
ADD COLUMN     "node_version" VARCHAR(4) NOT NULL DEFAULT '24',
ADD COLUMN     "output_dir" VARCHAR(200) NOT NULL DEFAULT 'dist',
ADD COLUMN     "root_dir" VARCHAR(200) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "cloud_git_installations" (
    "id" UUID NOT NULL,
    "installation_id" BIGINT NOT NULL,
    "team_id" UUID NOT NULL,
    "account_login" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(20) NOT NULL,
    "created_by_id" UUID,
    "suspended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_git_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_env_vars" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value_sealed" TEXT NOT NULL,
    "production" BOOLEAN NOT NULL DEFAULT true,
    "preview" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_env_vars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_builds" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "trigger" "CloudBuildTrigger" NOT NULL,
    "target" "CloudTarget" NOT NULL,
    "branch" VARCHAR(200) NOT NULL,
    "commit" VARCHAR(40) NOT NULL,
    "commit_message" VARCHAR(500),
    "author" VARCHAR(100),
    "pull_request" INTEGER,
    "status" "CloudBuildStatus" NOT NULL DEFAULT 'QUEUED',
    "error" VARCHAR(500),
    "log" TEXT NOT NULL DEFAULT '',
    "deployment_id" UUID,
    "builder" VARCHAR(60),
    "created_by_id" UUID,
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "cloud_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_git_deliveries" (
    "id" VARCHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_git_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_pull_comments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "pull_request" INTEGER NOT NULL,
    "comment_id" BIGINT NOT NULL,

    CONSTRAINT "cloud_pull_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_git_installations_installation_id_key" ON "cloud_git_installations"("installation_id");

-- CreateIndex
CREATE INDEX "cloud_git_installations_team_id_idx" ON "cloud_git_installations"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_env_vars_project_id_key_key" ON "cloud_env_vars"("project_id", "key");

-- CreateIndex
CREATE INDEX "cloud_builds_status_queued_at_idx" ON "cloud_builds"("status", "queued_at");

-- CreateIndex
CREATE INDEX "cloud_builds_project_id_queued_at_idx" ON "cloud_builds"("project_id", "queued_at");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_builds_project_id_number_key" ON "cloud_builds"("project_id", "number");

-- CreateIndex
CREATE INDEX "cloud_git_deliveries_received_at_idx" ON "cloud_git_deliveries"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_pull_comments_project_id_pull_request_key" ON "cloud_pull_comments"("project_id", "pull_request");

-- AddForeignKey
ALTER TABLE "cloud_git_installations" ADD CONSTRAINT "cloud_git_installations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_env_vars" ADD CONSTRAINT "cloud_env_vars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_builds" ADD CONSTRAINT "cloud_builds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_pull_comments" ADD CONSTRAINT "cloud_pull_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
