-- CreateTable
CREATE TABLE "cloud_buckets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(63) NOT NULL,
    "garage_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_bucket_keys" (
    "id" UUID NOT NULL,
    "bucket_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "access_key_id" VARCHAR(64) NOT NULL,
    "write" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_bucket_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_buckets_name_key" ON "cloud_buckets"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_buckets_garage_id_key" ON "cloud_buckets"("garage_id");

-- CreateIndex
CREATE INDEX "cloud_buckets_project_id_idx" ON "cloud_buckets"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_bucket_keys_access_key_id_key" ON "cloud_bucket_keys"("access_key_id");

-- CreateIndex
CREATE INDEX "cloud_bucket_keys_bucket_id_idx" ON "cloud_bucket_keys"("bucket_id");

-- AddForeignKey
ALTER TABLE "cloud_buckets" ADD CONSTRAINT "cloud_buckets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "cloud_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_bucket_keys" ADD CONSTRAINT "cloud_bucket_keys_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "cloud_buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

