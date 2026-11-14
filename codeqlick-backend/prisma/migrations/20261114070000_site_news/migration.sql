-- AlterTable
ALTER TABLE "managed_sites" ADD COLUMN     "news_built_at" TIMESTAMPTZ(3),
ADD COLUMN     "news_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "site_news_posts" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "photo" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_news_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_news_posts_site_id_published_at_idx" ON "site_news_posts"("site_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_news_posts_site_id_slug_key" ON "site_news_posts"("site_id", "slug");

-- AddForeignKey
ALTER TABLE "site_news_posts" ADD CONSTRAINT "site_news_posts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "managed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_news_posts" ADD CONSTRAINT "site_news_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
