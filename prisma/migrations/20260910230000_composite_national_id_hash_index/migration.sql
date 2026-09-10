-- Replace non-composite nationalIdHash index with composite (businessId, nationalIdHash)
-- This matches how the column is queried in the API routes
-- (where: { businessId, nationalIdHash }) and prevents accidental global-lookup patterns.

-- Drop the old single-column index on national_id_hash
DROP INDEX IF EXISTS "employees_national_id_hash_idx";

-- Create new composite index scoped by business
CREATE INDEX IF NOT EXISTS "employees_business_id_national_id_hash_idx"
  ON "employees"("business_id", "national_id_hash");
