-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_recovery_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totp_secret" TEXT;
