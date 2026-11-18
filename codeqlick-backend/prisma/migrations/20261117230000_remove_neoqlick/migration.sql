-- Neoqlick leaves Codeqlick (architecture 4.7, decisions 138-140): it is a separate project with
-- its own repository, API and database, and it starts from scratch, so nothing is copied.

-- 1. Delete the NEOQLICK realm's accounts. Their sessions, passkeys, tokens, SSO codes and any other
--    dependent row go with them (ON DELETE CASCADE / SET NULL); the 18+ tables are dropped below.
DELETE FROM "signup_tokens" WHERE "realm" = 'NEOQLICK';
DELETE FROM "sso_codes" WHERE "realm" = 'NEOQLICK';
DELETE FROM "users" WHERE "realm" = 'NEOQLICK';

-- 2. Drop the 18+ tables (Videochat, Swipe, Cruising, Adult). No kept table references them, and they
--    reference each other, so they go in one statement.
DROP TABLE
  "videochat_profiles",
  "videochat_push_subscriptions",
  "videochat_reports",
  "videochat_blocks",
  "videochat_likes",
  "videochat_call_logs",
  "videochat_active_days",
  "videochat_sanctions",
  "videochat_appeals",
  "swipe_profiles",
  "swipe_photos",
  "swipe_votes",
  "swipe_matches",
  "swipe_messages",
  "swipe_reports",
  "swipe_blocks",
  "swipe_takedowns",
  "swipe_push_subscriptions",
  "swipe_blocked_hashes",
  "cruising_profiles",
  "cruising_spots",
  "cruising_reviews",
  "cruising_reports",
  "cruising_takedowns",
  "cruising_media",
  "cruising_blocked_hashes",
  "cruising_check_ins",
  "cruising_nickname_changes",
  "cruising_conversation_starts",
  "cruising_conversations",
  "cruising_messages",
  "cruising_blocks",
  "cruising_favorites",
  "cruising_alerts",
  "cruising_push_subscriptions",
  "cruising_trusted_contacts",
  "cruising_timers",
  "cruising_health_centers",
  "cruising_spot_hours",
  "cruising_review_votes",
  "cruising_meetups",
  "cruising_meetup_attendees",
  "cruising_trips",
  "cruising_safety_alerts",
  "cruising_safety_votes",
  "cruising_album_grants",
  "cruising_room_messages",
  "cruising_winks",
  "cruising_profile_views",
  "cruising_notifications",
  "adult_verifications",
  "adult_suspensions",
  "adult_banned_emails",
  "adult_suspension_reviews";

-- 3. Drop the 18+ enums.
DROP TYPE "VideochatReportReason";
DROP TYPE "VideochatReportStatus";
DROP TYPE "VideochatVerificationStatus";
DROP TYPE "VideochatGender";
DROP TYPE "VideochatSanctionKind";
DROP TYPE "VideochatAppealStatus";
DROP TYPE "SwipeGender";
DROP TYPE "SwipeVerificationStatus";
DROP TYPE "SwipePhotoStatus";
DROP TYPE "SwipeReportReason";
DROP TYPE "SwipeReportStatus";
DROP TYPE "SwipeTakedownStatus";
DROP TYPE "CruisingSpotType";
DROP TYPE "CruisingSpotTag";
DROP TYPE "CruisingSpotStatus";
DROP TYPE "CruisingReviewStatus";
DROP TYPE "CruisingReportTarget";
DROP TYPE "CruisingLookingFor";
DROP TYPE "CruisingReportReason";
DROP TYPE "CruisingVerificationStatus";
DROP TYPE "CruisingMediaKind";
DROP TYPE "CruisingMediaAlbum";
DROP TYPE "CruisingMediaStatus";
DROP TYPE "CruisingReportStatus";
DROP TYPE "CruisingTakedownStatus";
DROP TYPE "CruisingAlertChannel";
DROP TYPE "CruisingPrepStatus";
DROP TYPE "CruisingContactStatus";
DROP TYPE "CruisingMeetupStatus";
DROP TYPE "CruisingSafetyKind";
DROP TYPE "CruisingSafetyVoteKind";
DROP TYPE "CruisingNotificationKind";
DROP TYPE "AdultApp";
DROP TYPE "AdultVerificationStatus";
DROP TYPE "AdultSuspensionCategory";
DROP TYPE "AdultSuspensionReviewStatus";

-- 4. Remove the realm machinery: trigger, check, columns, indexes and the enum.
DROP TRIGGER "users_realm_immutable" ON "users";
DROP FUNCTION "users_realm_immutable"();
ALTER TABLE "users" DROP CONSTRAINT "users_realm_role_check";

DROP INDEX "users_realm_email_key";
DROP INDEX "users_realm_username_key";
DROP INDEX "signup_tokens_realm_email_idx";

ALTER TABLE "users" DROP COLUMN "realm", DROP COLUMN "terms_version", DROP COLUMN "terms_accepted_at";
ALTER TABLE "sso_codes" DROP COLUMN "realm";
ALTER TABLE "signup_tokens" DROP COLUMN "realm", DROP COLUMN "terms_version";

DROP TYPE "Realm";

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "signup_tokens_email_idx" ON "signup_tokens"("email");

-- 5. The extra account languages (FR, DE, IT, PT) were only for Cruising: back to EN and ES. Anyone
--    left on one of them falls back to English.
CREATE TYPE "Locale_new" AS ENUM ('EN', 'ES');
ALTER TABLE "users" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'EN';
ALTER TABLE "signup_tokens" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "leads" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "leads" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "leads" ALTER COLUMN "locale" SET DEFAULT 'EN';
ALTER TABLE "post_translations" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "portfolio_translations" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "bookings" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "bookings" ALTER COLUMN "locale" SET DEFAULT 'EN';
ALTER TABLE "client_reviews" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "client_reviews" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "client_reviews" ALTER COLUMN "locale" SET DEFAULT 'EN';
ALTER TABLE "appointments" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "appointments" ALTER COLUMN "locale" SET DEFAULT 'ES';
ALTER TABLE "link_checks" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "site_audits" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "cloud_status_subscribers" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
ALTER TABLE "newsletter_subscribers" ALTER COLUMN "locale" TYPE "Locale_new" USING (CASE WHEN "locale"::text IN ('EN', 'ES') THEN "locale"::text ELSE 'EN' END)::"Locale_new";
DROP TYPE "Locale";
ALTER TYPE "Locale_new" RENAME TO "Locale";
