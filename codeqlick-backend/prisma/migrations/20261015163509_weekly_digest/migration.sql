-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_digest_at" TIMESTAMPTZ(3),
ADD COLUMN     "weekly_digest" BOOLEAN NOT NULL DEFAULT true;
