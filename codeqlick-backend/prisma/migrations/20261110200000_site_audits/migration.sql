-- CreateEnum
CREATE TYPE "SiteAuditStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "site_audits" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "status" "SiteAuditStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "lead_id" UUID,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_audits_email_created_at_idx" ON "site_audits"("email", "created_at");

-- CreateIndex
CREATE INDEX "site_audits_status_created_at_idx" ON "site_audits"("status", "created_at");

-- AddForeignKey
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
