-- The admin overview's MRR (decision 122): what each subscription bills a month before VAT, kept
-- by Stripe's webhook.

-- AlterTable
ALTER TABLE "client_projects" ADD COLUMN     "maintenance_amount_cents" INTEGER;

-- AlterTable
ALTER TABLE "cloud_teams" ADD COLUMN     "subscription_amount_cents" INTEGER;

-- The maintenance plans already paid bill decision 110's price (19 € a month before VAT). Cloud
-- PRO's price was never written down: those teams fill in at their next subscription event.
UPDATE "client_projects"
SET "maintenance_amount_cents" = 1900
WHERE "maintenance_status" IN ('ACTIVE', 'PAST_DUE')
  AND "maintenance_subscription_id" IS NOT NULL;
