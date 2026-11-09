-- CreateEnum
CREATE TYPE "VideochatVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "verification_key" TEXT,
ADD COLUMN     "verification_note" TEXT,
ADD COLUMN     "verification_sent_at" TIMESTAMPTZ(3),
ADD COLUMN     "verification_status" "VideochatVerificationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "verified_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "videochat_profiles_verification_status_verification_sent_at_idx" ON "videochat_profiles"("verification_status", "verification_sent_at");
