-- Phase 1: Security headers, composite indexes, and nationalId uniqueness fix
-- This migration is additive and backward-compatible.

-- 1. Fix nationalId uniqueness:
--    - Remove global @unique on encrypted nationalId
--    - Add nationalIdHash column for per-business duplicate detection
--    - Create index on nationalIdHash for fast lookups
--    Note: existing rows are NOT backfilled because nationalId is stored
--    encrypted; the application layer populates nationalIdHash on create/update.

-- Drop the old unique constraint on national_id
DROP INDEX IF EXISTS "employees_national_id_key";

-- Add national_id_hash column
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "national_id_hash" TEXT;

-- Create index on national_id_hash
CREATE INDEX IF NOT EXISTS "employees_national_id_hash_idx" ON "employees"("national_id_hash");

-- 2. Add composite indexes on PayrollRecord
CREATE INDEX IF NOT EXISTS "payroll_records_business_id_payroll_period_idx"
  ON "payroll_records"("business_id", "payroll_period");

CREATE INDEX IF NOT EXISTS "payroll_records_business_id_employee_id_idx"
  ON "payroll_records"("business_id", "employee_id");

CREATE INDEX IF NOT EXISTS "payroll_records_business_id_department_idx"
  ON "payroll_records"("business_id", "department");

-- 3. Add composite index on Employee
CREATE INDEX IF NOT EXISTS "employees_business_id_is_active_idx"
  ON "employees"("business_id", "is_active");
