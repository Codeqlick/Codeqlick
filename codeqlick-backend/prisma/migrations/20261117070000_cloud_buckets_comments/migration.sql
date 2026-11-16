-- AlterTable
ALTER TABLE "cloud_buckets" ADD COLUMN     "cors" JSONB,
ADD COLUMN     "public_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "cloud_comment_threads" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deployment_id" UUID,
    "deployment_short" VARCHAR(8) NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "selector" VARCHAR(500),
    "viewport_width" INTEGER,
    "created_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolved_by_name" VARCHAR(100),
    "last_comment_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_comment_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_comments" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "author_id" UUID,
    "author_name" VARCHAR(100) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "mention_ids" UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cloud_comment_threads_project_id_last_comment_at_idx" ON "cloud_comment_threads"("project_id", "last_comment_at");

-- CreateIndex
CREATE INDEX "cloud_comment_threads_deployment_id_idx" ON "cloud_comment_threads"("deployment_id");

-- CreateIndex
CREATE INDEX "cloud_comments_thread_id_created_at_idx" ON "cloud_comments"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "cloud_comment_threads" ADD CONSTRAINT "cloud_comment_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_comment_threads" ADD CONSTRAINT "cloud_comment_threads_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "cloud_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_comment_threads" ADD CONSTRAINT "cloud_comment_threads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_comment_threads" ADD CONSTRAINT "cloud_comment_threads_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_comments" ADD CONSTRAINT "cloud_comments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "cloud_comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_comments" ADD CONSTRAINT "cloud_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

