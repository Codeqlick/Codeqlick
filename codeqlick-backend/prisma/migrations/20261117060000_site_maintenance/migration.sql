-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "client_projects" ADD COLUMN     "maintenance_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maintenance_customer_id" TEXT,
ADD COLUMN     "maintenance_included_at" TIMESTAMPTZ(3),
ADD COLUMN     "maintenance_included_reason" TEXT,
ADD COLUMN     "maintenance_period_end" TIMESTAMPTZ(3),
ADD COLUMN     "maintenance_since" TIMESTAMPTZ(3),
ADD COLUMN     "maintenance_status" "MaintenanceStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "maintenance_subscription_id" TEXT,
ADD COLUMN     "maintenance_subscription_status" TEXT;

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "maintenance_included" BOOLEAN;

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_maintenance_subscription_id_key" ON "client_projects"("maintenance_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_maintenance_customer_id_key" ON "client_projects"("maintenance_customer_id");

-- CreateIndex
CREATE INDEX "client_projects_maintenance_status_idx" ON "client_projects"("maintenance_status");

-- CreateIndex
CREATE INDEX "support_tickets_project_id_created_at_idx" ON "support_tickets"("project_id", "created_at");
