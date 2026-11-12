-- CreateTable
CREATE TABLE "cloud_forms" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "recipient_ids" UUID[],
    "over_limit_month" VARCHAR(7),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloud_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_form_submissions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "email" VARCHAR(254),
    "page" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_forms_key_key" ON "cloud_forms"("key");

-- CreateIndex
CREATE INDEX "cloud_forms_project_id_idx" ON "cloud_forms"("project_id");

-- CreateIndex
CREATE INDEX "cloud_form_submissions_form_id_created_at_idx" ON "cloud_form_submissions"("form_id", "created_at");

-- CreateIndex
CREATE INDEX "cloud_form_submissions_created_at_idx" ON "cloud_form_submissions"("created_at");

-- AddForeignKey
ALTER TABLE "cloud_forms" ADD CONSTRAINT "cloud_forms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_form_submissions" ADD CONSTRAINT "cloud_form_submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "cloud_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
