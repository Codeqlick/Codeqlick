-- CreateEnum
CREATE TYPE "SiteBuildStatus" AS ENUM ('NONE', 'BUILDING', 'LIVE', 'FAILED');

-- CreateTable
CREATE TABLE "managed_sites" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "domain" TEXT,
    "status" "SiteBuildStatus" NOT NULL DEFAULT 'NONE',
    "last_build_at" TIMESTAMPTZ(3),
    "last_build_error" TEXT,
    "release" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "managed_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_site_revisions" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managed_site_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "managed_sites_project_id_key" ON "managed_sites"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "managed_sites_slug_key" ON "managed_sites"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "managed_sites_domain_key" ON "managed_sites"("domain");

-- CreateIndex
CREATE INDEX "managed_site_revisions_site_id_created_at_idx" ON "managed_site_revisions"("site_id", "created_at");

-- AddForeignKey
ALTER TABLE "managed_sites" ADD CONSTRAINT "managed_sites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_site_revisions" ADD CONSTRAINT "managed_site_revisions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "managed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_site_revisions" ADD CONSTRAINT "managed_site_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
