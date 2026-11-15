-- Cruising: nicknames can be changed whenever the member wants (decision 83). Each old nickname
-- stays reserved for its owner for 14 days.
CREATE TABLE "cruising_nickname_changes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "old_nickname" VARCHAR(20) NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_nickname_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cruising_nickname_changes_user_id_changed_at_idx" ON "cruising_nickname_changes"("user_id", "changed_at");

CREATE INDEX "cruising_nickname_changes_old_nickname_changed_at_idx" ON "cruising_nickname_changes"("old_nickname", "changed_at");

ALTER TABLE "cruising_nickname_changes" ADD CONSTRAINT "cruising_nickname_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
