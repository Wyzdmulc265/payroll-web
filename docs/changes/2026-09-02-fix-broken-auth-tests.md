# Fix broken auth test files

**Type:** refactor
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

`src/lib/auth/__tests__/session.test.ts` and `src/lib/auth/auth.test.ts`
could not compile or pass. The session test imported non-existent exports
(`generateSessionToken`, `invalidateAllUserSessions`) and called
`validateSessionToken` expecting `{ session, user }` instead of
`SessionContext | null`. The auth test called async rate-limit functions
without `await`, causing hangs and DB errors.

## 2. What changed

- `session.test.ts` rewritten to match the current `session.ts` API.
- `auth.test.ts` fixed with `await` on all async rate-limit calls and a
  `beforeEach` that clears the `RateLimit` table.
- New `password.test.ts` and `cookies.test.ts` added.
- Created `vitest.config.ts` and `vitest.setup.ts` (they did not exist).
- Added migration `20260902144200_add_rate_limit_table` because the
  `RateLimit` model was in the schema but had never been migrated to the
  database.

## 3. How it works

`vitest.config.ts` sets `environment: 'node'`, loads `vitest.setup.ts`,
and includes `src/**/*.test.{ts,tsx}`. `vitest.setup.ts` imports
`dotenv/config` and asserts `DATABASE_URL` is set.

`session.test.ts` now tests:
- `createSession(userId, metadata?)` → `{ token, expiresAt }`
- `validateSessionToken(token)` → `SessionContext | null`
- `invalidateSession(token)` and `invalidateAllSessionsForUser(userId)`
- Expired-session rejection, inactive-user rejection
- Cookie flags (`httpOnly`, `sameSite: 'lax'`, `secure` in production)

`auth.test.ts` now:
- `await`s `checkLoginRateLimit` and `clearLoginRateLimit`
- Truncates `RateLimit` in `beforeEach`
- Uses a time-unique key per test run

## 4. What got better

- Auth tests compile and pass (9 + 4 + 3 + 2 = 18 new passing tests).
- Test environment is reproducible via `vitest.config.ts`.
- `RateLimit` table now exists in the database.

## 5. Risks and trade-offs

- `prisma generate` was run to pick up the `RateLimit` model; generated
  client changed in `prisma/generated/`.
- Tests write to the real PostgreSQL database; isolation is via
  `beforeEach` truncation.

## 6. Test plan

- `npx vitest run src/lib/auth/` → 18 tests pass.
- `npx vitest run` → 88 tests pass total.

## 7. Follow-ups

- Consider `DATABASE_URL_TEST` for full test isolation.
- Migrate existing tests to use the same `createSession` helper pattern.
