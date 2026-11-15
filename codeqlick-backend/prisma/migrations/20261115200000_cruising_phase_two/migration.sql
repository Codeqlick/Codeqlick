-- CreateEnum
CREATE TYPE "CruisingLookingFor" AS ENUM ('CHAT', 'FRIENDS', 'DATES', 'FUN', 'GROUP');

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "nickname" VARCHAR(20),
ADD COLUMN     "bio" VARCHAR(160) NOT NULL DEFAULT '',
ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "looking_for" "CruisingLookingFor"[] DEFAULT ARRAY[]::"CruisingLookingFor"[],
ADD COLUMN     "show_age" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "cruising_check_ins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_conversations" (
    "id" UUID NOT NULL,
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "starter_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "read_a_at" TIMESTAMPTZ(3),
    "read_b_at" TIMESTAMPTZ(3),
    "notified_a_at" TIMESTAMPTZ(3),
    "notified_b_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruising_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cruising_profiles_nickname_key" ON "cruising_profiles"("nickname");

-- CreateIndex
CREATE INDEX "cruising_check_ins_spot_id_expires_at_idx" ON "cruising_check_ins"("spot_id", "expires_at");

-- CreateIndex
CREATE INDEX "cruising_check_ins_user_id_created_at_idx" ON "cruising_check_ins"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_check_ins_expires_at_idx" ON "cruising_check_ins"("expires_at");

-- CreateIndex
CREATE INDEX "cruising_conversations_user_b_id_idx" ON "cruising_conversations"("user_b_id");

-- CreateIndex
CREATE INDEX "cruising_conversations_last_message_at_idx" ON "cruising_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "cruising_conversations_starter_id_created_at_idx" ON "cruising_conversations"("starter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cruising_conversations_user_a_id_user_b_id_key" ON "cruising_conversations"("user_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "cruising_messages_conversation_id_created_at_idx" ON "cruising_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_messages_sender_id_created_at_idx" ON "cruising_messages"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_blocks_blocked_id_idx" ON "cruising_blocks"("blocked_id");

-- AddForeignKey
ALTER TABLE "cruising_check_ins" ADD CONSTRAINT "cruising_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_check_ins" ADD CONSTRAINT "cruising_check_ins_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "cruising_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_conversations" ADD CONSTRAINT "cruising_conversations_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_conversations" ADD CONSTRAINT "cruising_conversations_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_messages" ADD CONSTRAINT "cruising_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "cruising_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_messages" ADD CONSTRAINT "cruising_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_blocks" ADD CONSTRAINT "cruising_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_blocks" ADD CONSTRAINT "cruising_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Conversation starts, counted for the 10 a day even after the conversation is deleted.
CREATE TABLE "cruising_conversation_starts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_conversation_starts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cruising_conversation_starts_user_id_created_at_idx" ON "cruising_conversation_starts"("user_id", "created_at");

ALTER TABLE "cruising_conversation_starts" ADD CONSTRAINT "cruising_conversation_starts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
