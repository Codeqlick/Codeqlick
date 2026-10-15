-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('REQUESTED', 'SUBMITTED');

-- CreateTable
CREATE TABLE "project_briefs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'REQUESTED',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_briefs_project_id_key" ON "project_briefs"("project_id");

-- AddForeignKey
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
