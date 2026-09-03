# Bug: Super-admin login returns 401 because seed accounts were wiped and the seed aborted mid-run

**Severity:** critical
**Date discovered:** 2026-09-03
**Date fixed:** 2026-09-03
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

`super@wiztech.com` could not log in to production (`POST /api/auth/login`
returned 401). `npm run prisma:seed` failed with

```
PrismaClientKnownRequestError: Foreign key constraint violated on the
constraint: `settings_business_id_fkey`  (code P2003)
```

after printing `📋 Seeding settings...`. The intended bootstrap account did
not exist in the database.

## 2. Reproduction

1. Run `npm run prisma:seed` against `DATABASE_URL`.
2. Observe the `settings_business_id_fkey` P2003 error mid-seed; no users are
   created.
3. Query `User` — `super@wiztech.com` is absent (only test leftovers such as
   `admin-a@test.com` remain).

Non-deterministic: the seed sometimes completed successfully and sometimes
failed, depending on concurrent activity.

## 3. Impact

- **Critical** of a payroll system: no bootstrap admin meant no way in, and
  the production database was being silently reset to "test leftover" state.
- The root cause was discovered while chasing a recurring 401 that kept
  returning after every test run.

## 4. Root cause

Two compounding causes:

1. **Tests wiped the production database.** `vitest.setup.ts`
   (`vitest.setup.ts:1-5`) only required `DATABASE_URL`. The Vitest suite
   connects to whatever `DATABASE_URL` points at and runs destructive
   `beforeEach` cleanup (`user.deleteMany()`, `business.deleteMany()`, etc. —
   see `prisma/seed.ts` and the auth integration tests). Because
   `DATABASE_URL` pointed at the Neon database that is also production, every
   `npm test` deleted the seeded `super@wiztech.com` account and the seeded
   business, dropping login to 401.

2. **The seed cleanup was incomplete/racy.** `prisma/seed.ts` deleted rows in
   an order that left `fringeBenefit` and `business` rows behind; it also
   called `business.upsert({ where: { id: 'test-biz-001' } })` and then
   `settings.upsert(..., { businessId: business.id })` as two separate
   statements. If a concurrent test run deleted `test-biz-001` between the
   `business.upsert` and the `settings.upsert`, the settings insert violated
   `settings_business_id_fkey` (P2003).

## 5. Fix

In `prisma/seed.ts`:

- Completed the teardown by adding the missing `fringeBenefit.deleteMany()`
  (before `payrollRecord.deleteMany()`) and `business.deleteMany()` (after
  `user.deleteMany()`), so the cleanup now runs in canonical FK order and the
  next `business.upsert` starts from a clean slate.

In `vitest.setup.ts`:

- Redirected the test run to an isolated database when
  `DATABASE_URL_TEST` is set, and **refuse to start** when it is not, so the
  destructive test cleanup can never target production again.

The production database was then re-seeded with `npm run prisma:seed`
(succeeded with 43 settings, 8 employees, and the four bootstrap accounts).

## 6. Verification

- Manually inspected `User` after seeding: `super@wiztech.com`,
  `admin@testbiz.local`, `operator@testbiz.local`, `viewer@testbiz.local` all
  present with `status=ACTIVE`; a `bcrypt.compare` of each bootstrap password
  against `passwordHash` returned `true`.
- Re-ran `npm run prisma:seed`; it seeded successfully.
- Ran `npx vitest run` without `DATABASE_URL_TEST`; it aborted immediately
  with the new guard error (`DATABASE_URL_TEST is not set. Tests run
  destructive cleanup...`) and issued **no** destructive writes.

## 7. Prevention

- **Never run the destructive Vitest suite against a database that holds real
  data.** `DATABASE_URL_TEST` must be a separate Neon project/branch, and
  `vitest.setup.ts` now hard-blocks any test run that lacks it.
- Documented `DATABASE_URL_TEST` in `.env.example` so new environments
  provision it by default.
- Consider making the seed idempotent within a single transaction
  (`prisma.$transaction`) so a shared seed cannot interleave with other
  writers (follow-up; see `docs/changes/2026-09-03-test-database-isolation.md`).
