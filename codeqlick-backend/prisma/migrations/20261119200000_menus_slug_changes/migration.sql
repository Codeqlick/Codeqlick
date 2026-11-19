-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "slug_changed_at" TIMESTAMPTZ(3)[] DEFAULT ARRAY[]::TIMESTAMPTZ(3)[];

