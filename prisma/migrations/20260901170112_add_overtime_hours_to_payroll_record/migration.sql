-- AlterTable
ALTER TABLE "payroll_records" ADD COLUMN     "normal_overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN     "off_day_overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN     "public_holiday_overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0;
