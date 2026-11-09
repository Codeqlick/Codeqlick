-- CreateEnum
CREATE TYPE "ErrorSource" AS ENUM ('API', 'WEB_SERVER', 'WEB_BROWSER');

-- CreateTable
CREATE TABLE "error_groups" (
    "id" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "source" "ErrorSource" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "stack" VARCHAR(8000),
    "method" VARCHAR(10),
    "path" VARCHAR(500),
    "reference" VARCHAR(100),
    "user_agent" VARCHAR(300),
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "error_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "error_groups_fingerprint_key" ON "error_groups"("fingerprint");

-- CreateIndex
CREATE INDEX "error_groups_resolved_at_last_seen_at_idx" ON "error_groups"("resolved_at", "last_seen_at");
