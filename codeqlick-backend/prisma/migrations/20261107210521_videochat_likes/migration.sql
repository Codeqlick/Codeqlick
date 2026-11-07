-- CreateTable
CREATE TABLE "videochat_likes" (
    "from_id" UUID NOT NULL,
    "to_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videochat_likes_pkey" PRIMARY KEY ("from_id","to_id")
);

-- CreateIndex
CREATE INDEX "videochat_likes_to_id_idx" ON "videochat_likes"("to_id");

-- AddForeignKey
ALTER TABLE "videochat_likes" ADD CONSTRAINT "videochat_likes_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videochat_likes" ADD CONSTRAINT "videochat_likes_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
