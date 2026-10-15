-- AlterTable
ALTER TABLE "portfolio_items" ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[];
