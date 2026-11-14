-- AlterTable
ALTER TABLE "cloud_forms" ADD COLUMN     "spam_filter" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "cloud_form_submissions" ADD COLUMN     "content_hash" VARCHAR(64),
ADD COLUMN     "spam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spam_reason" VARCHAR(20);

-- CreateIndex
CREATE INDEX "cloud_form_submissions_form_id_spam_created_at_idx" ON "cloud_form_submissions"("form_id", "spam", "created_at");

-- CreateIndex
CREATE INDEX "cloud_form_submissions_form_id_content_hash_created_at_idx" ON "cloud_form_submissions"("form_id", "content_hash", "created_at");
