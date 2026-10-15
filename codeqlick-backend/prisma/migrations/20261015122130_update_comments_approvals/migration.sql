-- AlterTable
ALTER TABLE "project_updates" ADD COLUMN     "approval_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "approved_at" TIMESTAMPTZ(3),
ADD COLUMN     "approved_by_id" UUID;

-- CreateTable
CREATE TABLE "project_update_comments" (
    "id" UUID NOT NULL,
    "update_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_update_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_update_comments_update_id_created_at_idx" ON "project_update_comments"("update_id", "created_at");

-- AddForeignKey
ALTER TABLE "project_update_comments" ADD CONSTRAINT "project_update_comments_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "project_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_update_comments" ADD CONSTRAINT "project_update_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
