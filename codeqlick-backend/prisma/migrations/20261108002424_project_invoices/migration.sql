-- CreateTable
CREATE TABLE "project_invoices" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "due_on" DATE,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "paid_at" TIMESTAMPTZ(3),
    "file_name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_invoices_number_key" ON "project_invoices"("number");

-- CreateIndex
CREATE INDEX "project_invoices_project_id_issued_on_idx" ON "project_invoices"("project_id", "issued_on");

-- AddForeignKey
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "client_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
