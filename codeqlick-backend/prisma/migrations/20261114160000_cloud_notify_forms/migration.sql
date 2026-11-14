-- AlterTable
ALTER TABLE "cloud_notify_channels" ADD COLUMN     "form_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "form_submitted" BOOLEAN NOT NULL DEFAULT false;
