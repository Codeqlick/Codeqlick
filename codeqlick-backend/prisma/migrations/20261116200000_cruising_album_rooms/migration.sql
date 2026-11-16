-- CreateEnum
CREATE TYPE "CruisingMediaAlbum" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterEnum
ALTER TYPE "CruisingReportTarget" ADD VALUE 'ROOM_MESSAGE';

-- AlterTable
ALTER TABLE "cruising_media" ADD COLUMN     "album" "CruisingMediaAlbum" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "cruising_profiles" ADD COLUMN     "room_muted_until" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "cruising_reports" ADD COLUMN     "room_message_id" UUID;

-- CreateTable
CREATE TABLE "cruising_album_grants" (
    "owner_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_album_grants_pkey" PRIMARY KEY ("owner_id","grantee_id")
);

-- CreateTable
CREATE TABLE "cruising_room_messages" (
    "id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "city_slug" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cruising_room_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cruising_album_grants_grantee_id_idx" ON "cruising_album_grants"("grantee_id");

-- CreateIndex
CREATE INDEX "cruising_room_messages_country_code_city_slug_created_at_idx" ON "cruising_room_messages"("country_code", "city_slug", "created_at");

-- CreateIndex
CREATE INDEX "cruising_room_messages_user_id_created_at_idx" ON "cruising_room_messages"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "cruising_room_messages_created_at_idx" ON "cruising_room_messages"("created_at");

-- CreateIndex
CREATE INDEX "cruising_reports_room_message_id_idx" ON "cruising_reports"("room_message_id");

-- AddForeignKey
ALTER TABLE "cruising_reports" ADD CONSTRAINT "cruising_reports_room_message_id_fkey" FOREIGN KEY ("room_message_id") REFERENCES "cruising_room_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_album_grants" ADD CONSTRAINT "cruising_album_grants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_album_grants" ADD CONSTRAINT "cruising_album_grants_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruising_room_messages" ADD CONSTRAINT "cruising_room_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

