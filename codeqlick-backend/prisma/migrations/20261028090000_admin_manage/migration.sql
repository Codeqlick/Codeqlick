-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "created_by_id" UUID,
ALTER COLUMN "email" DROP NOT NULL;
-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
