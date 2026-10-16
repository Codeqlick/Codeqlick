-- AlterTable
ALTER TABLE "users" ADD COLUMN     "registered_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "signup_tokens" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_tokens_token_hash_key" ON "signup_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "signup_tokens_email_idx" ON "signup_tokens"("email");

-- Every account so far was made by its owner or accepted its welcome email.
UPDATE "users" SET "registered_at" = "created_at";
