-- AlterTable
ALTER TABLE "users" ADD COLUMN     "member_of_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_member_of_id_fkey" FOREIGN KEY ("member_of_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
