-- CreateTable
CREATE TABLE "site_form_messages" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_form_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_form_messages_form_id_created_at_idx" ON "site_form_messages"("form_id", "created_at");

-- CreateIndex
CREATE INDEX "site_form_messages_created_at_idx" ON "site_form_messages"("created_at");

-- AddForeignKey
ALTER TABLE "site_form_messages" ADD CONSTRAINT "site_form_messages_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "site_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
