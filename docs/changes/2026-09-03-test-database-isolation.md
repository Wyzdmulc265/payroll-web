# Isolate the test suite from the production database via `DATABASE_URL_TEST`

**Type:** dependency
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none (see `docs/bugsfix/2026-09-03-seed-wiped-and-aborted.md`)

---

## 1. Why

The Vitest suite performs destructive cleanup against whatever
`DATABASE_URL` points at. That string resolved to the Neon database that is
also used by production, so every `npm test` deleted the seeded bootstrap
accounts and business — causing the recurring `super@wiztech.com` 401. The
test suite needs its own database and must fail loudly rather than silently
destroy real data when one is not configured. See
`docs/IMPROVEMENTS.md` and the linked bug-fix for the 401 report.

## 2. What changed

- The test suite now reads `DATABASE_URL_TEST` for its Prisma connection.
- If `DATABASE_URL_TEST` is unset, `npm test` aborts immediately with a
  clear error instead of running destructive cleanup against production.
- `DATABASE_URL_TEST` is documented in `.env.example` so new environments
  provision a separate test database by default.

## 3. How it works

`vitest.setup.ts` is loaded before any test file and is the first thing to
touch the environment:

```ts
import 'dotenv/config';

const testUrl = process.env.DATABASE_URL_TEST;
if (testUrl) {
  process.env.DATABASE_URL = testUrl; // Prisma client now targets the test DB
} else {
  throw new Error(
    'DATABASE_URL_TEST is not set. Tests run destructive cleanup and must ' +
    'target an isolated test database, never production.'
  );
}
```

Because `src/lib/prisma.ts` builds its client from
`process.env.DATABASE_URL` at import time (`src/lib/prisma.ts:9`), and
`vitest.setup.ts` runs before any `import` of `prisma`, the redirected value
is the one the client uses.

## 4. What got better

- **Safety (qualitative):** it is now impossible for the test suite to wipe
  production data; the run aborts before any `deleteMany`.
- **Diagnosis (qualitative):** the failure mode changes from "silently
  missing accounts / random 401" to an explicit, actionable error.
- No schema or API changes; additive environment contract.

## 5. Risks and trade-offs

- `DATABASE_URL_TEST` is now a hard prerequisite for running tests. Any
  environment without it (including local dev) must provision a test DB
  (e.g. a Neon project/branch) and run `npx prisma migrate deploy` (or
  `db push`) plus the seed against it before `npm test` works.
- This is intentionally breaking: the old behaviour (running tests against
  the shared DB) was the bug.

## 6. Test plan

- Ran `npx vitest run` without `DATABASE_URL_TEST` — aborted immediately
  with the new guard error and issued no destructive writes.
- With a real `DATABASE_URL_TEST` provisioned, verify the suite runs to
  completion against the test DB and that the production DB is untouched.

## 7. Follow-ups

- Provision a dedicated test database and set `DATABASE_URL_TEST` in
  `.env.local` and CI secrets.
- (Optional) Add a `docs/DATABASE.md` note documenting the test/prod DB
  split.
