-- CreateEnum
CREATE TYPE "LinkSourceType" AS ENUM ('POST', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('OK', 'BROKEN');

-- CreateTable
CREATE TABLE "link_checks" (
    "id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "source_type" "LinkSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "internal" BOOLEAN NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'OK',
    "status_code" INTEGER,
    "error" VARCHAR(200),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "broken_since" TIMESTAMPTZ(3),
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_checks_url_source_type_source_id_locale_key" ON "link_checks"("url", "source_type", "source_id", "locale");

-- CreateIndex
CREATE INDEX "link_checks_source_type_source_id_idx" ON "link_checks"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "link_checks_status_url_idx" ON "link_checks"("status", "url");
