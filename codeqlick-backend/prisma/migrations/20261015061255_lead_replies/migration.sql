-- CreateTable
CREATE TABLE "lead_replies" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "author_id" UUID,
    "author_name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_replies_lead_id_created_at_idx" ON "lead_replies"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "lead_replies" ADD CONSTRAINT "lead_replies_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_replies" ADD CONSTRAINT "lead_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
