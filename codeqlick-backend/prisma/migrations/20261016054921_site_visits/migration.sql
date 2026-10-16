-- AlterTable
ALTER TABLE "managed_sites" ADD COLUMN     "umami_website_id" TEXT;

-- CreateTable
CREATE TABLE "site_form_days" (
    "form_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "site_form_days_pkey" PRIMARY KEY ("form_id","day")
);

-- AddForeignKey
ALTER TABLE "site_form_days" ADD CONSTRAINT "site_form_days_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "site_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
