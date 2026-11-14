-- CreateTable
CREATE TABLE "post_slug_redirects" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "post_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_slug_redirects" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "portfolio_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_slug_redirects_slug_key" ON "post_slug_redirects"("slug");

-- CreateIndex
CREATE INDEX "post_slug_redirects_post_id_idx" ON "post_slug_redirects"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_slug_redirects_slug_key" ON "portfolio_slug_redirects"("slug");

-- CreateIndex
CREATE INDEX "portfolio_slug_redirects_portfolio_item_id_idx" ON "portfolio_slug_redirects"("portfolio_item_id");

-- AddForeignKey
ALTER TABLE "post_slug_redirects" ADD CONSTRAINT "post_slug_redirects_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_slug_redirects" ADD CONSTRAINT "portfolio_slug_redirects_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
