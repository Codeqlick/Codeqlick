-- CreateTable
CREATE TABLE "booking_pages" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "duration_minutes" INTEGER NOT NULL,
    "location" VARCHAR(200) NOT NULL DEFAULT '',
    "meeting_room_id" UUID,
    "ask_phone" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" VARCHAR(64) NOT NULL,
    "weekly" JSONB NOT NULL,
    "min_notice_hours" INTEGER NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(40),
    "note" VARCHAR(500),
    "locale" "Locale" NOT NULL DEFAULT 'ES',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancel_token_hash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_pages_slug_key" ON "booking_pages"("slug");

-- CreateIndex
CREATE INDEX "booking_pages_owner_id_created_at_idx" ON "booking_pages"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_cancel_token_hash_key" ON "appointments"("cancel_token_hash");

-- CreateIndex
CREATE INDEX "appointments_owner_id_status_starts_at_idx" ON "appointments"("owner_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_page_id_starts_at_idx" ON "appointments"("page_id", "starts_at");

-- AddForeignKey
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_meeting_room_id_fkey" FOREIGN KEY ("meeting_room_id") REFERENCES "meeting_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "booking_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
