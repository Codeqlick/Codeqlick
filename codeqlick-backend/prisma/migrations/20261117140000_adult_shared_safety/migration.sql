-- CreateEnum
CREATE TYPE "AdultApp" AS ENUM ('CRUISING', 'SWIPE', 'VIDEOCHAT');

-- CreateEnum
CREATE TYPE "AdultVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdultSuspensionCategory" AS ENUM ('MINOR', 'NON_CONSENSUAL', 'ILLEGAL');

-- CreateEnum
CREATE TYPE "AdultSuspensionReviewStatus" AS ENUM ('PENDING', 'SHARED', 'KEPT');

-- AlterTable
ALTER TABLE "cruising_blocks" ADD COLUMN     "source_app" "AdultApp";

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "suspension_category" VARCHAR(20);

-- AlterTable
ALTER TABLE "swipe_blocks" ADD COLUMN     "source_app" "AdultApp";

-- AlterTable
ALTER TABLE "swipe_profiles" ADD COLUMN     "suspension_category" VARCHAR(20);

-- AlterTable
ALTER TABLE "videochat_blocks" ADD COLUMN     "source_app" "AdultApp";

-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "suspension_category" VARCHAR(20);

-- CreateTable
CREATE TABLE "adult_verifications" (
    "user_id" UUID NOT NULL,
    "status" "AdultVerificationStatus" NOT NULL DEFAULT 'NONE',
    "source_app" "AdultApp",
    "verified_name" VARCHAR(40),
    "photo_key" TEXT,
    "note" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "tries_since" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "adult_verifications_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "adult_suspensions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "AdultSuspensionCategory" NOT NULL,
    "source_app" "AdultApp" NOT NULL,
    "report_id" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "until" TIMESTAMPTZ(3),
    "by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifted_at" TIMESTAMPTZ(3),
    "lifted_by_id" UUID,
    "lift_reason" VARCHAR(500),

    CONSTRAINT "adult_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adult_banned_emails" (
    "id" UUID NOT NULL,
    "email_hash" VARCHAR(64) NOT NULL,
    "category" "AdultSuspensionCategory" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "adult_banned_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adult_suspension_reviews" (
    "app" "AdultApp" NOT NULL,
    "user_id" UUID NOT NULL,
    "suspended_at" TIMESTAMPTZ(3) NOT NULL,
    "category" "AdultSuspensionCategory" NOT NULL,
    "report_id" UUID,
    "status" "AdultSuspensionReviewStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adult_suspension_reviews_pkey" PRIMARY KEY ("app","user_id","suspended_at")
);

-- CreateIndex
CREATE INDEX "adult_verifications_status_sent_at_idx" ON "adult_verifications"("status", "sent_at");

-- CreateIndex
CREATE INDEX "adult_suspensions_user_id_created_at_idx" ON "adult_suspensions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "adult_banned_emails_email_hash_idx" ON "adult_banned_emails"("email_hash");

-- CreateIndex
CREATE INDEX "adult_banned_emails_expires_at_idx" ON "adult_banned_emails"("expires_at");

-- CreateIndex
CREATE INDEX "adult_suspension_reviews_status_idx" ON "adult_suspension_reviews"("status");

-- AddForeignKey
ALTER TABLE "adult_verifications" ADD CONSTRAINT "adult_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adult_verifications" ADD CONSTRAINT "adult_verifications_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adult_suspensions" ADD CONSTRAINT "adult_suspensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adult_suspensions" ADD CONSTRAINT "adult_suspensions_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adult_suspensions" ADD CONSTRAINT "adult_suspensions_lifted_by_id_fkey" FOREIGN KEY ("lifted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adult_suspension_reviews" ADD CONSTRAINT "adult_suspension_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adult_suspension_reviews" ADD CONSTRAINT "adult_suspension_reviews_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---- Data migration (architecture 4.16, phase 1) ----------------------------------------------
-- The file moves (verification photos) and the block side effects (matches, conversations, album
-- grants and likes between people now blocked) run afterwards in the API's idempotent one-off task
-- (AdultMigrationService).

-- 1. Blocks are shared (decision 112): every row of each block table is copied into the other two,
--    with the table it came from as source_app. The rows already there keep a null source_app.
INSERT INTO "swipe_blocks" ("blocker_id", "blocked_id", "created_at", "source_app")
SELECT "blocker_id", "blocked_id", "created_at", 'CRUISING' FROM "cruising_blocks" WHERE "source_app" IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO "videochat_blocks" ("blocker_id", "blocked_id", "created_at", "source_app")
SELECT "blocker_id", "blocked_id", "created_at", 'CRUISING' FROM "cruising_blocks" WHERE "source_app" IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO "cruising_blocks" ("blocker_id", "blocked_id", "created_at", "source_app")
SELECT "blocker_id", "blocked_id", "created_at", 'SWIPE' FROM "swipe_blocks" WHERE "source_app" IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO "videochat_blocks" ("blocker_id", "blocked_id", "created_at", "source_app")
SELECT "blocker_id", "blocked_id", "created_at", 'SWIPE' FROM "swipe_blocks" WHERE "source_app" IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO "cruising_blocks" ("blocker_id", "blocked_id", "created_at", "source_app")
SELECT "blocker_id", "blocked_id", "created_at", 'VIDEOCHAT' FROM "videochat_blocks" WHERE "source_app" IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO "swipe_blocks" ("blocker_id", "blocked_id", "created_at", "source_app")
SELECT "blocker_id", "blocked_id", "created_at", 'VIDEOCHAT' FROM "videochat_blocks" WHERE "source_app" IS NULL
ON CONFLICT DO NOTHING;

-- 2. One verification per account (decision 113), built from the three profiles: any APPROVED wins
--    (the earliest, its app and its name), otherwise the newest PENDING, otherwise the newest
--    REJECTED with its note. The photo (Swipe's kept approved one, or the pending one) is moved by
--    the one-off task, which deletes every other verification photo; nobody is emailed.
INSERT INTO "adult_verifications"
  ("user_id", "status", "source_app", "verified_name", "note", "sent_at", "decided_at", "created_at", "updated_at")
SELECT "user_id", "status"::"AdultVerificationStatus", "app", "name", "note", "sent_at",
       CASE WHEN "status" = 'APPROVED' THEN COALESCE("verified_at", "sent_at") END,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT c.*, row_number() OVER (
    PARTITION BY c."user_id"
    ORDER BY CASE c."status" WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
             CASE WHEN c."status" = 'APPROVED' THEN c."verified_at" END ASC NULLS LAST,
             c."sent_at" DESC NULLS LAST
  ) AS "rank"
  FROM (
    SELECT p."user_id", 'CRUISING'::"AdultApp" AS "app", p."verification_status"::text AS "status",
           p."verified_at", p."verification_sent_at" AS "sent_at", p."verification_note" AS "note",
           p."nickname" AS "name"
    FROM "cruising_profiles" p WHERE p."verification_status" <> 'NONE'
    UNION ALL
    SELECT p."user_id", 'SWIPE'::"AdultApp", p."verification_status"::text, p."verified_at",
           p."verification_sent_at", p."verification_note", COALESCE(p."nickname", u."username")
    FROM "swipe_profiles" p JOIN "users" u ON u."id" = p."user_id"
    WHERE p."verification_status" <> 'NONE'
    UNION ALL
    SELECT p."user_id", 'VIDEOCHAT'::"AdultApp", p."verification_status"::text, p."verified_at",
           p."verification_sent_at", p."verification_note", COALESCE(p."nickname", u."username")
    FROM "videochat_profiles" p JOIN "users" u ON u."id" = p."user_id"
    WHERE p."verification_status" <> 'NONE'
  ) c
) ranked
WHERE "rank" = 1
ON CONFLICT ("user_id") DO NOTHING;

-- 3. Serious suspensions (decision 114): existing ones stay per app (no category was recorded).
--    Active ones whose report was MINOR, NON_CONSENSUAL or ILLEGAL are listed once for the team
--    ("Review for all 18+ apps"), to share in the three apps or to leave; nothing is shared here.
INSERT INTO "adult_suspension_reviews" ("app", "user_id", "suspended_at", "category", "report_id")
SELECT DISTINCT ON (p."user_id") 'VIDEOCHAT'::"AdultApp", p."user_id", p."suspended_at",
       r."reason"::text::"AdultSuspensionCategory", r."id"
FROM "videochat_profiles" p
JOIN "videochat_reports" r ON r."reported_id" = p."user_id"
  AND r."reason"::text IN ('MINOR', 'NON_CONSENSUAL', 'ILLEGAL')
  AND (r."status" = 'ACTIONED'
       OR r."id" IN (SELECT s."report_id" FROM "videochat_sanctions" s
                     WHERE s."user_id" = p."user_id" AND s."kind" = 'SUSPENDED'
                       AND s."report_id" IS NOT NULL))
WHERE p."suspended_at" IS NOT NULL
  AND (p."suspended_until" IS NULL OR p."suspended_until" > CURRENT_TIMESTAMP)
ORDER BY p."user_id", CASE r."reason"::text WHEN 'MINOR' THEN 0 WHEN 'NON_CONSENSUAL' THEN 1 ELSE 2 END,
         r."created_at" DESC
ON CONFLICT DO NOTHING;
INSERT INTO "adult_suspension_reviews" ("app", "user_id", "suspended_at", "category", "report_id")
SELECT DISTINCT ON (p."user_id") 'SWIPE'::"AdultApp", p."user_id", p."suspended_at",
       r."reason"::text::"AdultSuspensionCategory", r."id"
FROM "swipe_profiles" p
JOIN "swipe_reports" r ON r."reported_id" = p."user_id" AND r."status" = 'ACTIONED'
  AND r."reason"::text IN ('MINOR', 'NON_CONSENSUAL', 'ILLEGAL')
WHERE p."suspended_at" IS NOT NULL
  AND (p."suspended_until" IS NULL OR p."suspended_until" > CURRENT_TIMESTAMP)
ORDER BY p."user_id", CASE r."reason"::text WHEN 'MINOR' THEN 0 WHEN 'NON_CONSENSUAL' THEN 1 ELSE 2 END,
         r."created_at" DESC
ON CONFLICT DO NOTHING;
INSERT INTO "adult_suspension_reviews" ("app", "user_id", "suspended_at", "category", "report_id")
SELECT DISTINCT ON (p."user_id") 'CRUISING'::"AdultApp", p."user_id", p."suspended_at",
       r."reason"::text::"AdultSuspensionCategory", r."id"
FROM "cruising_profiles" p
JOIN "cruising_reports" r ON r."reported_id" = p."user_id" AND r."status" = 'ACTIONED'
  AND r."reason"::text IN ('MINOR', 'NON_CONSENSUAL', 'ILLEGAL')
WHERE p."suspended_at" IS NOT NULL
  AND (p."suspended_until" IS NULL OR p."suspended_until" > CURRENT_TIMESTAMP)
ORDER BY p."user_id", CASE r."reason"::text WHEN 'MINOR' THEN 0 WHEN 'NON_CONSENSUAL' THEN 1 ELSE 2 END,
         r."created_at" DESC
ON CONFLICT DO NOTHING;
