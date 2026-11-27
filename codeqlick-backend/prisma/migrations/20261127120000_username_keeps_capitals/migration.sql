-- Usernames keep the capitals they were chosen with and are unique ignoring them: the unique
-- index moves from "username" to "username_lower", its lower-cased form.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username_lower" TEXT;

-- Existing usernames are all lower case: each one's key is itself.
UPDATE "users" SET "username_lower" = lower("username") WHERE "username" IS NOT NULL;

-- DropIndex
DROP INDEX "users_username_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_username_lower_key" ON "users"("username_lower");

-- The key always follows the username, whatever writes it.
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_lower_check" CHECK ("username_lower" IS NOT DISTINCT FROM lower("username"));

-- AlterTable: the username chosen at sign-up waits here until the email is confirmed.
ALTER TABLE "signup_tokens" ADD COLUMN     "username" TEXT;
