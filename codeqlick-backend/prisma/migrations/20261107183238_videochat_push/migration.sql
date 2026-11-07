-- AlterTable
ALTER TABLE "videochat_profiles" ADD COLUMN     "push_notified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "videochat_push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videochat_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videochat_push_subscriptions_endpoint_key" ON "videochat_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "videochat_push_subscriptions_user_id_idx" ON "videochat_push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "videochat_push_subscriptions" ADD CONSTRAINT "videochat_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
