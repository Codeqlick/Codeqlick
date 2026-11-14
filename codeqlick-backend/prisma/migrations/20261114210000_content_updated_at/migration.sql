-- AlterTable
ALTER TABLE "portfolio_items" ADD COLUMN     "content_updated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "content_updated_at" TIMESTAMPTZ(3);
