-- CreateEnum
CREATE TYPE "SecurityCheckStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "security_checks" (
    "id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "status" "SecurityCheckStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "grade" TEXT,
    "result" JSONB,
    "error" TEXT,
    "lead_id" UUID,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "security_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_checks_email_created_at_idx" ON "security_checks"("email", "created_at");

-- CreateIndex
CREATE INDEX "security_checks_domain_created_at_idx" ON "security_checks"("domain", "created_at");

-- CreateIndex
CREATE INDEX "security_checks_status_created_at_idx" ON "security_checks"("status", "created_at");

-- AddForeignKey
ALTER TABLE "security_checks" ADD CONSTRAINT "security_checks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

