-- CreateEnum
CREATE TYPE "SitePurchaseStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateTable
CREATE TABLE "site_purchases" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "SitePurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "project_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_purchases_stripe_session_id_key" ON "site_purchases"("stripe_session_id");

-- CreateIndex
CREATE INDEX "site_purchases_lead_id_idx" ON "site_purchases"("lead_id");

-- AddForeignKey
ALTER TABLE "site_purchases" ADD CONSTRAINT "site_purchases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_purchases" ADD CONSTRAINT "site_purchases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

