-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "client" TEXT,
ADD COLUMN     "parent_family_id" UUID;

-- CreateTable
CREATE TABLE "sso_codes" (
    "id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "client" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "parent_family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "family_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_codes_code_hash_key" ON "sso_codes"("code_hash");

-- CreateIndex
CREATE INDEX "sso_codes_user_id_idx" ON "sso_codes"("user_id");

-- CreateIndex
CREATE INDEX "sso_codes_expires_at_idx" ON "sso_codes"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_parent_family_id_idx" ON "sessions"("parent_family_id");

-- AddForeignKey
ALTER TABLE "sso_codes" ADD CONSTRAINT "sso_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

