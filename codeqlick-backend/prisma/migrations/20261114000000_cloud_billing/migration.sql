-- AlterTable
ALTER TABLE "cloud_teams" ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "current_period_end" TIMESTAMPTZ(3),
ADD COLUMN     "stripe_customer_id" VARCHAR(100),
ADD COLUMN     "stripe_subscription_id" VARCHAR(100),
ADD COLUMN     "subscription_status" VARCHAR(30);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_teams_stripe_customer_id_key" ON "cloud_teams"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_teams_stripe_subscription_id_key" ON "cloud_teams"("stripe_subscription_id");

