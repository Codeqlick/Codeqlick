-- CreateTable
CREATE TABLE "cloud_databases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "pg_name" VARCHAR(20) NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "size_checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_databases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_databases_pg_name_key" ON "cloud_databases"("pg_name");

-- CreateIndex
CREATE INDEX "cloud_databases_project_id_idx" ON "cloud_databases"("project_id");

-- AddForeignKey
ALTER TABLE "cloud_databases" ADD CONSTRAINT "cloud_databases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

