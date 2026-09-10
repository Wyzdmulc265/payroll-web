# Bug: legacy global unique constraint blocks cross-business employeeId reuse

**Severity:** high
**Date discovered:** 2026-09-10
**Date fixed:** 2026-09-10
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

`npm run prisma:seed` fails with:

```
Unique constraint failed on the constraint: `employees_employee_id_key`
```

The seed tries to insert `EMP001` for both Business A and Business B. The second insert fails even though the Prisma schema declares `@@unique([employeeId, businessId])`, which should allow the same employee ID in different businesses.

## 2. Reproduction

1. Apply all migrations including `20260910230000_composite_national_id_hash_index`.
2. Run `npm run prisma:seed`.
3. Observe `P2002` on `prisma/seed.ts:164` during the second `EMP001` insert.

## 3. Impact

- **High**: the seed cannot complete, so no test accounts have employees. Any attempt to create employees with reused `employeeId` values across businesses fails at the database level, contradicting the schema’s intent.

## 4. Root cause

The initial migration `20260901030658_init/migration.sql:92` created a global unique index:

```sql
CREATE UNIQUE INDEX "employees_employee_id_key" ON "employees"("employee_id");
```

This index predates the composite `@@unique([employeeId, businessId])` and was never removed. PostgreSQL enforces it strictly, so `EMP001` can exist only once across all businesses. File references:

- `prisma/migrations/20260901030658_init/migration.sql:92`
- `prisma/schema.prisma:145` — the correct composite unique is declared here

## 5. Fix

Added migration `20260910240000_drop_legacy_employee_id_unique` that drops the old index:

```sql
DROP INDEX IF EXISTS "employees_employee_id_key";
```

After applying, the composite `@@unique([employeeId, businessId])` is the only uniqueness enforcement on `employeeId`, and the seed inserts succeed.

## 6. Verification

- `npx prisma migrate deploy` applies `20260910240000_drop_legacy_employee_id_unique`.
- `npm run prisma:seed` completes successfully: 4 employees (2 per business).
- Cross-business `EMP001` inserts no longer conflict.

## 7. Prevention

- Audit all initial migrations for single-column unique indexes on tenant-scoped columns (`employee_id`, `national_id_hash`, etc.) and ensure they are dropped or replaced with composite versions when multi-tenancy is introduced.
- Add a migration review checklist item: "If adding composite unique constraints, verify no legacy single-column unique indexes remain on the same columns."
