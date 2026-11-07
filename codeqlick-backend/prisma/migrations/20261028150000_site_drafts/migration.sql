-- AlterTable
ALTER TABLE "managed_sites" ADD COLUMN     "draft_content" JSONB,
ADD COLUMN     "draft_key" TEXT,
ADD COLUMN     "draft_preset" TEXT,
ADD COLUMN     "draft_updated_at" TIMESTAMPTZ(3);
-- CreateIndex
CREATE UNIQUE INDEX "managed_sites_draft_key_key" ON "managed_sites"("draft_key");
