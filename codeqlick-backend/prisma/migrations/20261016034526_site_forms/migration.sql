-- CreateTable
CREATE TABLE "site_forms" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recipients" TEXT[],
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "last_submission_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_forms_project_id_key" ON "site_forms"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_forms_key_key" ON "site_forms"("key");

-- AddForeignKey
ALTER TABLE "site_forms" ADD CONSTRAINT "site_forms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
