-- Lead stages follow the sales process. Renaming the values keeps every lead where it was:
-- contacted → talking, qualified → call, archived → spam; "proposal sent" is new.
ALTER TYPE "LeadStatus" RENAME VALUE 'CONTACTED' TO 'TALKING';
ALTER TYPE "LeadStatus" RENAME VALUE 'QUALIFIED' TO 'CALL';
ALTER TYPE "LeadStatus" RENAME VALUE 'ARCHIVED' TO 'SPAM';
ALTER TYPE "LeadStatus" ADD VALUE 'PROPOSAL' AFTER 'CALL';

-- CreateEnum
CREATE TYPE "LeadLostReason" AS ENUM ('PRICE', 'NO_RESPONSE', 'NOT_A_FIT', 'CHOSE_OTHER', 'TIMING', 'OTHER');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "lost_reason" "LeadLostReason",
ADD COLUMN "follow_up_on" DATE,
ADD COLUMN "client_id" UUID;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
