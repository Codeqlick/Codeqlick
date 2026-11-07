-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "preview_follow_up_at" TIMESTAMPTZ(3),
ADD COLUMN     "proposal_id" UUID;

-- AlterTable
ALTER TABLE "managed_sites" ADD COLUMN     "reported_month" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "monthly_report" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "leads_proposal_id_key" ON "leads"("proposal_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
