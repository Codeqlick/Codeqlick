-- CreateTable
CREATE TABLE "meeting_rooms" (
    "id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "lobby" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "meeting_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_rooms_code_key" ON "meeting_rooms"("code");

-- CreateIndex
CREATE INDEX "meeting_rooms_owner_id_created_at_idx" ON "meeting_rooms"("owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
