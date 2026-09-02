# Payroll save returns 500 because FBT migration was not applied

**Severity:** high
**Date discovered:** 2026-09-01
**Date fixed:** 2026-09-01
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

After implementing the FBT feature, clicking "Save Payroll" on the
`/payroll` page returns a generic `500 Internal Server Error`. The
server logs show a Prisma exception similar to:

```
Unknown column `fringe_benefit_base` in `field list`
```

or

```
Unknown column `fbt_snapshot` in `field list`
```

The error happens before any `AuditLog` is written, so there is no
record of the failed save.

## 2. Reproduction

1. Checkout the FBT feature branch.
2. Ensure the database has only the migrations up to
   `20260901170112_add_overtime_hours_to_payroll_record`.
3. Start the dev server and open `/payroll`.
4. Enter overtime/bonuses for an employee and click **Save Payroll**.
5. The route handler attempts to create `PayrollRecord` rows that
   include `fringeBenefitBase`, `fringeBenefitTax`, and `fbtSnapshot`,
   and also tries to `createMany` into the `fringe_benefits` table.
6. Because the `20260901202008_add_fringe_benefit_tax` migration has
   not been applied, PostgreSQL rejects the query and Prisma throws.
7. The catch block logs the error and returns `500`.

## 3. Impact

- **High** — payroll cannot be saved at all after the FBT code merge,
  even when no fringe benefits are entered. The feature is a hard
  blocker for any payroll run in the period.
- The failure is silent to the end user except for the generic 500
  message; no actionable guidance is shown.

## 4. Root cause

The FBT implementation added new columns to `PayrollRecord` and a new
`FringeBenefit` model in `prisma/schema.prisma`, and generated a
migration at `prisma/migrations/20260901202008_add_fringe_benefit_tax/`.

During development the migration was created with
`prisma migrate dev --create-only` because the Neon database was
unreachable from the dev environment. The migration SQL file was
generated, but it was **never applied** to the database.

When the code was deployed/tested, the Prisma client was regenerated
(`npx prisma generate`) so TypeScript compilation succeeded, but the
database schema still lacked the new columns and table. The route
handler in `src/app/api/payroll/route.ts` writes those fields
unconditionally, so every save hits the missing-column error.

Triggering cause: database schema lag behind Prisma schema.
Root cause: the migration step was skipped during development.

## 5. Fix

Apply the pending migration to the database:

```bash
npx prisma migrate deploy
```

This runs `20260901202008_add_fringe_benefit_tax`, which:

- Adds `fbt_snapshot JSONB`, `fringe_benefit_base DECIMAL(15,2) NOT NULL DEFAULT 0`,
  and `fringe_benefit_tax DECIMAL(15,2) NOT NULL DEFAULT 0` to
  `payroll_records`.
- Creates `fringe_benefits` with `amount`, `taxable_value`,
  `payroll_record_id`, and an index on `payroll_record_id`.
- Adds the foreign key `fringe_benefits.payroll_record_id →
  payroll_records.id ON DELETE CASCADE`.

No code changes are required; the fix is purely operational.

## 6. Verification

- Re-run `POST /api/payroll` with a valid payload.
- Response is `200 { success: true, ... }`.
- A new `PayrollRecord` row now includes non-null `fringeBenefitBase`
  and `fringeBenefitTax` (both `0` when no benefits are entered).
- `FringeBenefit` rows are created when `fringeBenefitData` is
  provided.
- Run `npm run test` — all 45 tests pass.
- Run `npm run build` — Next.js build succeeds.

## 7. Prevention

- Add a CI step that runs `prisma migrate deploy` (or at least
  `prisma migrate status`) against a test database and fails the
  build if migrations are pending.
- Document in `docs/ARCHITECTURE.md` that every Prisma schema change
  must be accompanied by an applied migration before merge, not just
  a generated SQL file.
