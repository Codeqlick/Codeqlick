-- CreateTable
CREATE TABLE "videochat_call_logs" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "wait_sec" INTEGER,

    CONSTRAINT "videochat_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videochat_active_days" (
    "day" DATE NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "videochat_active_days_pkey" PRIMARY KEY ("day","user_id")
);

-- CreateIndex
CREATE INDEX "videochat_call_logs_started_at_idx" ON "videochat_call_logs"("started_at");

-- CreateIndex
CREATE INDEX "videochat_active_days_user_id_idx" ON "videochat_active_days"("user_id");

-- AddForeignKey
ALTER TABLE "videochat_active_days" ADD CONSTRAINT "videochat_active_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
