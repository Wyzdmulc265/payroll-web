-- AlterTable
ALTER TABLE "payroll_records" ADD COLUMN     "fbt_snapshot" JSONB,
ADD COLUMN     "fringe_benefit_base" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fringe_benefit_tax" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "fringe_benefits" (
    "id" TEXT NOT NULL,
    "payroll_record_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "taxable_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fringe_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fringe_benefits_payroll_record_id_idx" ON "fringe_benefits"("payroll_record_id");

-- AddForeignKey
ALTER TABLE "fringe_benefits" ADD CONSTRAINT "fringe_benefits_payroll_record_id_fkey" FOREIGN KEY ("payroll_record_id") REFERENCES "payroll_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
