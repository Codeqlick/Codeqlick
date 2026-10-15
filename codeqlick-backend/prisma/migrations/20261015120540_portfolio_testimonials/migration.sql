-- AlterTable
ALTER TABLE "portfolio_items" ADD COLUMN     "testimonial_author" TEXT;

-- AlterTable
ALTER TABLE "portfolio_translations" ADD COLUMN     "testimonial_quote" TEXT,
ADD COLUMN     "testimonial_role" TEXT;
