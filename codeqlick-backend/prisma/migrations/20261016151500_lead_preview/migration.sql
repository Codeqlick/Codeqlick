-- CreateEnum
CREATE TYPE "SitePreviewStatus" AS ENUM ('BUILDING', 'READY', 'FAILED', 'REMOVED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "preview_built_at" TIMESTAMPTZ(3),
ADD COLUMN     "preview_slug" TEXT,
ADD COLUMN     "preview_status" "SitePreviewStatus";

-- CreateIndex
CREATE UNIQUE INDEX "leads_preview_slug_key" ON "leads"("preview_slug");

