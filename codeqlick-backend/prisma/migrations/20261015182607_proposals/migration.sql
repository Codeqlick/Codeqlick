-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "client_id" UUID NOT NULL,
    "project_id" UUID,
    "created_by_id" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "terms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "valid_until" DATE,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMPTZ(3),
    "responded_at" TIMESTAMPTZ(3),
    "accepted_name" TEXT,
    "decline_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_items" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,

    CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_number_key" ON "proposals"("number");

-- CreateIndex
CREATE INDEX "proposals_status_updated_at_idx" ON "proposals"("status", "updated_at");

-- CreateIndex
CREATE INDEX "proposals_client_id_updated_at_idx" ON "proposals"("client_id", "updated_at");

-- CreateIndex
CREATE INDEX "proposal_items_proposal_id_position_idx" ON "proposal_items"("proposal_id", "position");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
