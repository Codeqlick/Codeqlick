-- Existing accounts start counting from now: the first weekly summary goes out next Monday
-- instead of right after this release.
UPDATE "users" SET "last_digest_at" = now() WHERE "last_digest_at" IS NULL;
