# Seed aborts at Settings upsert because effective-dated Settings migration was not applied

**Severity:** high
**Date discovered:** 2026-09-10
**Date fixed:** 2026-09-10
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

`npm run prisma:seed` fails with

```
PrismaClientKnownRequestError:
Invalid `prisma.settings.upsert()` invocation:
Database error. Code: `42P10`. Message: `there is no unique or exclusion constraint matching the ON CONFLICT specification`
```

The seed prints `📋 Seeding settings...` and aborts before any employees are created. Logging in as `admin@testbiz.local` shows the employees list is empty, even though `prisma/seed.ts` clearly defines 8 employees.

## 2. Reproduction

1. Checkout the repo and ensure `DATABASE_URL` points at a Neon database that only has migrations up to `20260905200153_phase1_security_indexes_and_nationalid`.
2. Run `npm run prisma:seed`.
3. Observe the `P2039` / `42P10` error on the first `settings.upsert(...)` call at `prisma/seed.ts:133`.
4. Query `Employee` — 0 rows; query `Settings` — only pre-existing rows (if any).

## 3. Impact

- **High** — developers and CI environments that freshly provision a database cannot complete seeding, so the test accounts (`admin@testbiz.local`, `operator@testbiz.local`, `viewer@testbiz.local`) have no employees and cannot exercise payroll flows.
- The failure is silent to anyone who has not read the seed logs; the app itself starts fine but the tenant is empty.

## 4. Root cause

The feature in `docs/changes/2026-09-08-effective-dated-settings-history.md` introduced a new unique constraint `(key, business_id, effective_from)` on `Settings` and a corresponding migration `prisma/migrations/20260908120000_settings_effective_dated_history/`.

That migration was **never applied** to the database. The Prisma client was regenerated (so TypeScript compiles), but the underlying PostgreSQL index/constraint does not exist. When the seed issues `prisma.settings.upsert(...)` with the new compound `where` (`key_businessId_effectiveFrom`), Prisma generates `INSERT ... ON CONFLICT (key, business_id, effective_from)` and PostgreSQL rejects it with `42P10` because no matching unique constraint exists.

Triggering cause: missing `prisma migrate deploy` step after the effective-dated settings feature was merged.
Root cause: the migration step was skipped during development, as happened previously for the FBT migration (`docs/bugsfix/2026-09-01-payroll-save-500-migration-not-applied.md`).

## 5. Fix

Apply the pending migration and re-run the seed:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

`prisma migrate deploy` applies `20260908120000_settings_effective_dated_history`, which drops the old `(key, business_id)` unique and adds `(key, business_id, effective_from)`. After that, the seed completes successfully (44 settings, 8 employees, 4 bootstrap users).

No code changes were required; the fix is purely operational.

## 6. Verification

- Re-ran `npm run prisma:seed` after applying migrations; output:
  ```
  ✅ Database seeded successfully!
     - 44 settings
     - 8 employees
  ```
- Verified via direct query: 8 `Employee` rows exist under `Test Business` (`test-biz-001`), including 7 active and 1 inactive (`Catherine Zulu`).
- `admin@testbiz.local` can now log in and see the seeded employees.

## 7. Prevention

- Add a CI step that runs `prisma migrate status` against a test database and fails the build if migrations are pending, mirroring the recommendation in `docs/bugsfix/2026-09-01-payroll-save-500-migration-not-applied.md#7-prevention`.
- Document in `docs/ARCHITECTURE.md` that every Prisma schema change must be accompanied by an applied migration before merge.
- Consider making the seed idempotent within a single `prisma.$transaction` so a partial seed cannot leave the database in a half-seeded state when interrupted (follow-up; see `docs/bugsfix/2026-09-03-seed-wiped-and-aborted.md`).
