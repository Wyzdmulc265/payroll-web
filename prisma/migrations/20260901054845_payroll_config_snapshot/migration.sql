/*
  Warnings:

  - You are about to drop the column `overtime_hours` on the `payroll_records` table. All the data in the column will be lost.
  - You are about to drop the column `overtime_rate` on the `payroll_records` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payroll_records" DROP COLUMN "overtime_hours",
DROP COLUMN "overtime_rate",
ADD COLUMN     "tevet_levy" DECIMAL(15,2) NOT NULL DEFAULT 0;
