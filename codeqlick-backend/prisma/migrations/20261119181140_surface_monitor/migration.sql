-- CreateEnum
CREATE TYPE "SurfaceScanStatus" AS ENUM ('DONE', 'FAILED');

-- AlterTable
ALTER TABLE "cloud_domains" ADD COLUMN     "surface_monitor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "surface_next_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "surface_scans" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "status" "SurfaceScanStatus" NOT NULL,
    "error" VARCHAR(20),
    "score" INTEGER,
    "grade" VARCHAR(2),
    "result" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surface_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surface_scans_domain_id_created_at_idx" ON "surface_scans"("domain_id", "created_at");

-- CreateIndex
CREATE INDEX "surface_scans_created_at_idx" ON "surface_scans"("created_at");

-- CreateIndex
CREATE INDEX "cloud_domains_surface_monitor_surface_next_at_idx" ON "cloud_domains"("surface_monitor", "surface_next_at");

-- AddForeignKey
ALTER TABLE "surface_scans" ADD CONSTRAINT "surface_scans_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "cloud_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surface_scans" ADD CONSTRAINT "surface_scans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
