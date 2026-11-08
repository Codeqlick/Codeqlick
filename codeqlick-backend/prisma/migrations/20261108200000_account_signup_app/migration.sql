-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signup_app" TEXT;

-- AlterTable
ALTER TABLE "signup_tokens" ADD COLUMN     "app" TEXT;

-- Existing accounts: the web app a self-registered account with no client relationship uses
-- (the first one found) is taken as the one it signed up from (decision 29).
UPDATE "users" u
SET "signup_app" = CASE
    WHEN EXISTS (SELECT 1 FROM "videochat_profiles" p WHERE p."user_id" = u."id") THEN 'videochat'
    WHEN EXISTS (SELECT 1 FROM "swipe_profiles" p WHERE p."user_id" = u."id") THEN 'swipe'
    WHEN EXISTS (SELECT 1 FROM "meeting_rooms" r WHERE r."owner_id" = u."id") THEN 'meetings'
    WHEN EXISTS (SELECT 1 FROM "booking_pages" b WHERE b."owner_id" = u."id") THEN 'citas'
  END
WHERE u."role" = 'CLIENT'
  AND u."registered_at" IS NOT NULL
  AND u."member_of_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "users" m WHERE m."member_of_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "client_projects" c WHERE c."client_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "proposals" p WHERE p."client_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "support_tickets" t WHERE t."client_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."client_id" = u."id");
