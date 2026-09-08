-- Settings history: make the key unique per (key, business_id, effective_from)
-- instead of (key, business_id) so the same statutory key can carry multiple
-- effective-dated values. The engine picks the row with the greatest
-- effective_from <= the pay period end.
--
-- NOTE: Several earlier hand-written migrations use non-canonical index names,
-- and Prisma's canonical name for this constraint is `settings_key_businessId_effectiveFrom_key`
-- (camelCase field join) while the mapped column is effective_from. We therefore
-- drop any pre-existing (key, business_id) unique defensively and create the new
-- index on the column tuple. Verify with `prisma migrate diff` in your environment
-- and reconcile the index NAME if your previous migration used a different one.

-- Drop the old per-(key, business_id) uniqueness, if present under either casing.
DROP INDEX IF EXISTS "settings_key_businessId_key";
DROP INDEX IF EXISTS "settings_key_business_id_key";
-- Also the legacy pre-tenant unique on key alone, if it still exists.
DROP INDEX IF EXISTS "settings_key_key";

-- New history-aware unique index on (key, business_id, effective_from).
CREATE UNIQUE INDEX "settings_key_businessId_effectiveFrom_key"
  ON "settings"("key", "business_id", "effective_from");