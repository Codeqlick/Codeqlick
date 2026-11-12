-- CreateEnum
CREATE TYPE "CloudPlan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "CloudRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CloudTarget" AS ENUM ('PREVIEW', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "CloudDomainState" AS ENUM ('PENDING', 'VERIFIED', 'LIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "CloudReportReason" AS ENUM ('PHISHING', 'MALWARE', 'ILLEGAL', 'COPYRIGHT', 'SEXUAL', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "CloudReportStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "cloud_teams" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "plan" "CloudPlan" NOT NULL DEFAULT 'FREE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "CloudRole" NOT NULL,
    "terms_version" VARCHAR(20) NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_invites" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "CloudRole" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "invited_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "last_used_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_device_codes" (
    "id" UUID NOT NULL,
    "device_code_hash" VARCHAR(64) NOT NULL,
    "user_code" VARCHAR(8) NOT NULL,
    "client_name" VARCHAR(60) NOT NULL,
    "user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "denied_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "last_polled_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_device_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_projects" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "production_deployment_id" UUID,
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(500),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_deployments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "short_id" VARCHAR(8) NOT NULL,
    "target" "CloudTarget" NOT NULL,
    "message" VARCHAR(200),
    "commit" VARCHAR(40),
    "branch" VARCHAR(100),
    "size_bytes" BIGINT NOT NULL,
    "file_count" INTEGER NOT NULL,
    "created_by_id" UUID,
    "token_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_domains" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(253) NOT NULL,
    "verification_token" VARCHAR(64) NOT NULL,
    "state" "CloudDomainState" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ(3),
    "checked_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_events" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(120) NOT NULL,
    "token_name" VARCHAR(80),
    "action" VARCHAR(60) NOT NULL,
    "target_label" VARCHAR(300),
    "details" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_reports" (
    "id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "project_id" UUID,
    "reason" "CloudReportReason" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "status" "CloudReportStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(1000),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_teams_slug_key" ON "cloud_teams"("slug");

-- CreateIndex
CREATE INDEX "cloud_members_user_id_idx" ON "cloud_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_members_team_id_user_id_key" ON "cloud_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_invites_token_hash_key" ON "cloud_invites"("token_hash");

-- CreateIndex
CREATE INDEX "cloud_invites_team_id_idx" ON "cloud_invites"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_tokens_token_hash_key" ON "cloud_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "cloud_tokens_user_id_idx" ON "cloud_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_device_codes_device_code_hash_key" ON "cloud_device_codes"("device_code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_device_codes_user_code_key" ON "cloud_device_codes"("user_code");

-- CreateIndex
CREATE INDEX "cloud_device_codes_expires_at_idx" ON "cloud_device_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_projects_slug_key" ON "cloud_projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_projects_production_deployment_id_key" ON "cloud_projects"("production_deployment_id");

-- CreateIndex
CREATE INDEX "cloud_projects_team_id_created_at_idx" ON "cloud_projects"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_deployments_project_id_created_at_idx" ON "cloud_deployments"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_deployments_project_id_short_id_key" ON "cloud_deployments"("project_id", "short_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_domains_name_key" ON "cloud_domains"("name");

-- CreateIndex
CREATE INDEX "cloud_domains_project_id_idx" ON "cloud_domains"("project_id");

-- CreateIndex
CREATE INDEX "cloud_domains_state_checked_at_idx" ON "cloud_domains"("state", "checked_at");

-- CreateIndex
CREATE INDEX "cloud_events_team_id_created_at_idx" ON "cloud_events"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_events_created_at_idx" ON "cloud_events"("created_at");

-- CreateIndex
CREATE INDEX "cloud_reports_status_created_at_idx" ON "cloud_reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "cloud_members" ADD CONSTRAINT "cloud_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_members" ADD CONSTRAINT "cloud_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_invites" ADD CONSTRAINT "cloud_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_invites" ADD CONSTRAINT "cloud_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_tokens" ADD CONSTRAINT "cloud_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_tokens" ADD CONSTRAINT "cloud_tokens_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_device_codes" ADD CONSTRAINT "cloud_device_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_production_deployment_id_fkey" FOREIGN KEY ("production_deployment_id") REFERENCES "cloud_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_deployments" ADD CONSTRAINT "cloud_deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_deployments" ADD CONSTRAINT "cloud_deployments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_deployments" ADD CONSTRAINT "cloud_deployments_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "cloud_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_domains" ADD CONSTRAINT "cloud_domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_events" ADD CONSTRAINT "cloud_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "cloud_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_events" ADD CONSTRAINT "cloud_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_reports" ADD CONSTRAINT "cloud_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
