-- CreateTable
CREATE TABLE "project_credentials" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "secret" TEXT NOT NULL,
    "notes" TEXT,
    "viewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_credentials_project_id_created_at_idx" ON "project_credentials"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "project_credentials" ADD CONSTRAINT "project_credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_credentials" ADD CONSTRAINT "project_credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
