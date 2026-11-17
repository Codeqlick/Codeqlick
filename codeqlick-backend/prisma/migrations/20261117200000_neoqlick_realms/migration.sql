-- CreateEnum
CREATE TYPE "Realm" AS ENUM ('CODEQLICK', 'NEOQLICK');

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "sso_codes" ADD COLUMN     "realm" "Realm" NOT NULL DEFAULT 'CODEQLICK';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "realm" "Realm" NOT NULL DEFAULT 'CODEQLICK',
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_version" TEXT;

-- AlterTable
ALTER TABLE "signup_tokens" ADD COLUMN     "realm" "Realm" NOT NULL DEFAULT 'CODEQLICK',
ADD COLUMN     "terms_version" TEXT;

-- DropIndex
DROP INDEX "signup_tokens_email_idx";

-- CreateIndex
CREATE INDEX "signup_tokens_realm_email_idx" ON "signup_tokens"("realm", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_realm_email_key" ON "users"("realm", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_realm_username_key" ON "users"("realm", "username");

-- A NEOQLICK account is never staff: its CLIENT role only means "no staff rights" (4.18).
ALTER TABLE "users"
  ADD CONSTRAINT "users_realm_role_check" CHECK ("realm" = 'CODEQLICK' OR "role" = 'CLIENT');

-- The realm is set at creation and never changes.
CREATE FUNCTION "users_realm_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."realm" IS DISTINCT FROM OLD."realm" THEN
    RAISE EXCEPTION 'users.realm is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_realm_immutable"
  BEFORE UPDATE OF "realm" ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_realm_immutable"();
