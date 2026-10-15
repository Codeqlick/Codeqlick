-- CreateTable
CREATE TABLE "update_drafts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" TEXT,
    "environment" "ReleaseEnvironment",
    "url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "update_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "update_drafts_project_id_created_at_idx" ON "update_drafts"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "update_drafts" ADD CONSTRAINT "update_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
