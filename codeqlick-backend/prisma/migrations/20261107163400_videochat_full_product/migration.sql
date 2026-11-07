-- CreateEnum
CREATE TYPE "VideochatGender" AS ENUM ('WOMAN', 'MAN', 'NONBINARY');

-- CreateEnum
CREATE TYPE "VideochatSanctionKind" AS ENUM ('SUSPENDED', 'LIFTED');

-- CreateEnum
CREATE TYPE "VideochatAppealStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "country" TEXT,
ADD COLUMN     "gender" "VideochatGender",
ADD COLUMN     "language" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "same_country_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "same_language_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seeking" "VideochatGender"[] DEFAULT ARRAY[]::"VideochatGender"[],
ADD COLUMN     "suspended_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "videochat_sanctions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "VideochatSanctionKind" NOT NULL,
    "reason" TEXT,
    "until" TIMESTAMPTZ(3),
    "by_id" UUID,
    "report_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videochat_sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videochat_appeals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sanction_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "VideochatAppealStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videochat_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "videochat_sanctions_user_id_created_at_idx" ON "videochat_sanctions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "videochat_appeals_sanction_id_key" ON "videochat_appeals"("sanction_id");

-- CreateIndex
CREATE INDEX "videochat_appeals_status_created_at_idx" ON "videochat_appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "videochat_appeals_user_id_idx" ON "videochat_appeals"("user_id");

-- AddForeignKey
ALTER TABLE "videochat_sanctions" ADD CONSTRAINT "videochat_sanctions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_sanctions" ADD CONSTRAINT "videochat_sanctions_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_appeals" ADD CONSTRAINT "videochat_appeals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_appeals" ADD CONSTRAINT "videochat_appeals_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "videochat_sanctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_appeals" ADD CONSTRAINT "videochat_appeals_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
