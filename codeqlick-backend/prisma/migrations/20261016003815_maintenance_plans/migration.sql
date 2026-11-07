-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "monthly_minutes" INTEGER NOT NULL,
    "alert_percent" INTEGER NOT NULL DEFAULT 80,
    "alerted_month" TEXT,
    "alerted_level" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_project_id_key" ON "maintenance_plans"("project_id");

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
