-- CreateEnum
CREATE TYPE "VideochatReportReason" AS ENUM ('MINOR', 'NON_CONSENSUAL', 'ILLEGAL', 'HARASSMENT', 'HATE', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "VideochatReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateTable
CREATE TABLE "videochat_profiles" (
    "user_id" UUID NOT NULL,
    "adult_confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "terms_version" TEXT NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "age_verified_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "videochat_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "videochat_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reported_id" UUID NOT NULL,
    "reason" "VideochatReportReason" NOT NULL,
    "details" TEXT,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "status" "VideochatReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videochat_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videochat_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videochat_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE INDEX "videochat_profiles_suspended_at_idx" ON "videochat_profiles"("suspended_at");

-- CreateIndex
CREATE INDEX "videochat_reports_status_created_at_idx" ON "videochat_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "videochat_reports_reported_id_created_at_idx" ON "videochat_reports"("reported_id", "created_at");

-- CreateIndex
CREATE INDEX "videochat_blocks_blocked_id_idx" ON "videochat_blocks"("blocked_id");

-- AddForeignKey
ALTER TABLE "videochat_profiles" ADD CONSTRAINT "videochat_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_reports" ADD CONSTRAINT "videochat_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_reports" ADD CONSTRAINT "videochat_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_reports" ADD CONSTRAINT "videochat_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_blocks" ADD CONSTRAINT "videochat_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_blocks" ADD CONSTRAINT "videochat_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
