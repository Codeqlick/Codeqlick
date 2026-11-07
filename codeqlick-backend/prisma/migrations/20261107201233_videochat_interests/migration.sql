-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];
