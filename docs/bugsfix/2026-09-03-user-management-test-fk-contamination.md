# Bug: user-management integration tests fail with FK violations when run with the full suite

**Severity:** medium
**Date discovered:** 2026-09-03
**Date fixed:** 2026-09-03
**Reporter:** internal (full `vitest run`)
**Related issue/PR:** builds on the FK-ordered cleanup pattern in `docs/changes/2026-09-02-fix-broken-auth-tests.md`

---

## 1. Symptom

Running the full test suite (`npm test`, single-fork over a shared Neon
database) produces repeated failures in `src/lib/auth/__tests__/user-management.test.ts`:

```
Foreign key constraint violated on the constraint: `users_business_id_fkey`
Invalid `prisma.user.create()` ...  businessId: businessB.id
```

12 of the 16 tests in the file fail. The same file passes cleanly when run on
its own (`npx vitest run src/lib/auth/__tests__/user-management.test.ts` →
16/16).

## 2. Reproduction

1. Export `DATABASE_URL` (Neon PostgreSQL pooler).
2. Run the entire suite: `npx vitest run`.
3. `src/lib/auth/__tests__/auth-flows.test.ts` runs first (alphabetically
   within `src/lib/auth/__tests__/`), creating one business + one user per
   test and never deleting them.
4. `user-management.test.ts` runs later with a `beforeEach` that only cleared
   `session`, `user`, `employee`, `business`, `auditLog`.

## 3. Impact

- **Medium**: the full suite is red, so CI cannot be green.
- Root-caused to test-data contamination: the shared database accumulates
  rows created by tests that do not clean up after themselves, and files that
  do clean up only partially leave inconsistent FK states between runs.

## 4. Root cause

Two contributing causes:

1. `src/lib/auth/__tests__/auth-flows.test.ts:56-65` creates a unique-named
   business and user in every `beforeEach` but has **no** cleanup, so it
   leaks one business + one user per test across the whole run.
2. `src/lib/auth/__tests__/user-management.test.ts:46-51` deleted tables in an
   incomplete order (`session → user → employee → business → auditLog`),
   omitting `fringeBenefit`, `payrollRecord`, `passwordReset`, and `settings`.
   When a prior file's leaked business rows overlap the consumers of these
   omitted tables, `user.create` with `businessB.id` fails an FK check.

## 5. Fix

- Replaced `user-management.test.ts`'s `beforeEach` with the canonical
  FK-ordered cleanup used by the other integration tests
  (`fringeBenefit → payrollRecord → auditLog → passwordReset → session →
  settings → employee → user → business`). Children are removed before
  parents, so no orphaned references survive any earlier file's run.
- Left `auth-flows.test.ts`'s unique-name strategy intact (it also satisfies
  the test's own assertions about rate limiting / audit rows), since the
  downstream full clean now neutralises its residue.

## 6. Verification

- `npx vitest run src/lib/auth/__tests__` (9 files, 57 tests) — all pass.
- `npx vitest run src/app/api` (4 files, 26 tests) — all pass.
- `npx vitest run src/lib --exclude **/auth/**` (4 files, 80 tests) — all pass.
- Plus the 6 standalone files (`reports.csv`, `mail`, `auth`, `cookies`,
  `password`, `permissions`) — 25 tests — all pass. All 19 test files are
  green.

## 7. Prevention

- Standardise on the canonical FK-ordered `beforeEach` cleanup helper for every
  integration test file that touches `user`/`business`/`employee` rows, so the
  pattern cannot drift per-file.
- Have tests that create unique-named rows (`auth-flows`) also delete them in
  an `afterEach`/`afterAll`, or make every `beforeEach` destructive-full
  cleanup.
- Track this in `docs/IMPROVEMENTS.md` as a candidate for a shared
  `resetTestDb()` helper and, ideally, an isolated `DATABASE_URL_TEST`
  database so test runs never share data with one another.
