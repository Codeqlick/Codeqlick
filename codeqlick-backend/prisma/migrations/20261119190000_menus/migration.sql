-- CreateEnum
CREATE TYPE "MenuKind" AS ENUM ('MENU', 'CATALOGUE');

-- CreateEnum
CREATE TYPE "MenuLanguage" AS ENUM ('EN', 'ES');

-- CreateEnum
CREATE TYPE "MenuReportReason" AS ENUM ('ILLEGAL', 'PHISHING', 'IMPERSONATION', 'COPYRIGHT', 'SEXUAL', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuReportStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "kind" "MenuKind" NOT NULL DEFAULT 'MENU',
    "business_name" VARCHAR(80) NOT NULL,
    "language" "MenuLanguage" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "title" VARCHAR(80) NOT NULL,
    "intro" VARCHAR(300) NOT NULL DEFAULT '',
    "address" VARCHAR(160) NOT NULL DEFAULT '',
    "opening_note" VARCHAR(300) NOT NULL DEFAULT '',
    "note" VARCHAR(300) NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "indexable" BOOLEAN NOT NULL DEFAULT true,
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_slug_redirects" (
    "id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_reports" (
    "id" UUID NOT NULL,
    "menu_id" UUID,
    "slug" VARCHAR(40) NOT NULL,
    "business_name" VARCHAR(80) NOT NULL,
    "reason" "MenuReportReason" NOT NULL,
    "details" VARCHAR(1000) NOT NULL,
    "email" VARCHAR(254),
    "status" "MenuReportStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(1000),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menus_slug_key" ON "menus"("slug");

-- CreateIndex
CREATE INDEX "menus_owner_id_created_at_idx" ON "menus"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "menu_slug_redirects_slug_key" ON "menu_slug_redirects"("slug");

-- CreateIndex
CREATE INDEX "menu_slug_redirects_menu_id_created_at_idx" ON "menu_slug_redirects"("menu_id", "created_at");

-- CreateIndex
CREATE INDEX "menu_slug_redirects_expires_at_idx" ON "menu_slug_redirects"("expires_at");

-- CreateIndex
CREATE INDEX "menu_reports_status_created_at_idx" ON "menu_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "menu_reports_created_at_idx" ON "menu_reports"("created_at");

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_slug_redirects" ADD CONSTRAINT "menu_slug_redirects_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_reports" ADD CONSTRAINT "menu_reports_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

