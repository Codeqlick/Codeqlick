-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'PUBLISHED', 'HIDDEN');

-- CreateTable
CREATE TABLE "client_reviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'REQUESTED',
    "rating" INTEGER,
    "quote" TEXT,
    "author_name" TEXT,
    "author_role" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_reviews_project_id_key" ON "client_reviews"("project_id");

-- CreateIndex
CREATE INDEX "client_reviews_status_published_at_idx" ON "client_reviews"("status", "published_at");

-- AddForeignKey
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
