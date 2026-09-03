# Dependency cleanup, vulnerability fix, and test stability

**Type:** dependency
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

Three separate concerns converged:

1. `npm audit` reported **5 vulnerabilities** (1 moderate, 4 high). The
   high-severity ones traced through `next-auth → @auth/core →
   nodemailer <=9.0.0`.
2. `depcheck` flagged **4 unused dependencies** that added weight to the
   dependency tree with no source-code usage.
3. `npm test` had **1 failing test** — the `audit-constants.test.ts` "10k-row
   performance test" exceeded its 2-second budget because `expect()` was
   called 40,000 times (4 assertions × 10,000 iterations) inside the loop.

## 2. What changed

- **Removed unused dependencies** from `package.json`:
  - `@react-pdf/renderer` — no imports anywhere in `src/`; payslips use
    `window.print()`.
  - `next-auth` — no imports anywhere in `src/`; custom session system
    (`src/lib/auth/`) is the active auth mechanism.
  - `pg` — no direct imports; PostgreSQL is accessed exclusively through
    `@prisma/adapter-pg`.
  - `@types/pg` (devDependency) — no longer needed once `pg` is gone.
- **Updated `nodemailer`** from `^8.0.11` to `^9.1.1` to patch
  `GHSA-p6gq-j5cr-w38f` (message-level raw option bypasses
  `disableFileAccess`/`disableUrlAccess`).
- **Fixed the failing performance test** in `src/lib/audit-constants.test.ts`:
  replaced 40,000 in-loop `expect()` calls with lightweight boolean checks;
  assertions now run once after the loop.
- **Replaced `as any` casts** with `as unknown as NextResponse` in
  `src/lib/auth/__tests__/cookies.test.ts` and
  `src/lib/auth/__tests__/session.test.ts`, removing the
  `eslint-disable-next-line` suppression comments.
- **Fixed `cookies.test.ts` TypeScript error**: the mock response's
  `cookies` object now includes the `_store` property required by the
  `MockCookieStore` interface.
- **Fixed Prisma 7 type-narrowing issues** in route handlers: extracted
  `const businessId = session.user.businessId` after tenant guards so that
  the narrowed type survives inside `$transaction` callbacks. Affected files:
  `src/app/api/employees/[id]/route.ts`,
  `src/app/api/employees/route.ts`,
  `src/app/api/settings/route.ts`.
- **Fixed Prisma 7 null-filtering** in `backfill.ts`: `updateMany` where
  clauses for required `businessId` fields now use raw SQL
  (`$executeRaw`) since Prisma 7's `StringFilter` does not accept `null`.

### Files removed from dependencies (`package.json`)

| Package            | Reason                                      |
|--------------------|---------------------------------------------|
| `@react-pdf/renderer` | Unused; payslips print via `window.print()` |
| `next-auth`        | Unused; custom session system is active     |
| `pg`               | Used only transitively via `@prisma/adapter-pg` |
| `@types/pg`        | Follows removal of `pg`                     |

### Packages verified as NOT unused (depcheck false positives)

| Package            | Actual usage                                 |
|--------------------|----------------------------------------------|
| `@prisma/client`   | Generated client imports `@prisma/client/runtime/client` |
| `pg` (transitive)  | Dependency of `@prisma/adapter-pg`           |
| `tailwindcss`      | PostCSS plugin reference in `postcss.config.mjs` |
| `@tailwindcss/postcss` | Same                                         |
| `@types/react-dom` | Type resolution via `typeRoots`              |

## 3. How it works

### Test fix (`audit-constants.test.ts`)

The original test called `expect()` inside the 10,000-iteration loop:

```ts
// Before — 40,000 expect() calls, ~2.5s
for (let i = 0; i < N; i++) {
  const q = buildAuditLogQuery(filters, { page: (i % 20) + 1, limit: 50 });
  expect(q.where.businessId).toBe(filters.businessId);
  expect(q.where.timestamp).toBeDefined();
  expect(q.where.timestamp!).toBeDefined();
  expect(q.take).toBe(50);
}
```

The fix moves invariant checks to lightweight boolean comparisons inside
the loop and asserts once at the end:

```ts
// After — 0 expect() calls in loop, ~50ms
let violations = 0;
for (let i = 0; i < N; i++) {
  const q = buildAuditLogQuery(filters, { page: (i % 20) + 1, limit: 50 });
  if (q.where.businessId !== filters.businessId) violations++;
  if (!q.where.timestamp) violations++;
  // ...
}
expect(violations).toBe(0);
expect(elapsedMs).toBeLessThan(2000);
```

### Route type-narrowing fix

```ts
// Before — TypeScript loses narrowing inside $transaction callback
if (!session.user.businessId) return unauthorized();
// ...
const employee = await prisma.$transaction(async (tx) => {
  // session.user.businessId is string | null here (narrowing lost in closure)
  where: { businessId: session.user.businessId }, // TS2322
});

// After — extract to local const
const businessId = session.user.businessId;
if (!businessId) return unauthorized();
const employee = await prisma.$transaction(async (tx) => {
  where: { businessId }, // businessId is string (narrowed in outer scope)
});
```

### Backfill fix

```ts
// Before — TypeError (Prisma 7 StringFilter rejects null)
where: { businessId: { equals: null } }

// After — raw SQL for required-field null check
await prisma.$executeRaw`UPDATE "employees" SET "business_id" = ${business.id} WHERE "business_id" IS NULL`;
```

## 4. What got better

| Metric                | Before                         | After                |
|-----------------------|--------------------------------|----------------------|
| `npm audit` vulns     | 5 (1 moderate, 4 high)         | 2 (1 moderate, 1 high) |
| `npm test` (perf test)| Failed (~2.5s, budget 2s)      | Passed (~45ms)       |
| `tsc --noEmit`        | 10 type errors                 | 0 errors             |
| `as any` in tests     | 4 occurrences (with disable comments) | 0  |
| Direct dependencies   | 17                             | 13                   |

The remaining 2 vulnerabilities (`mysql2 <=3.23.0`, high) come from the
`prisma` CLI devDependency and only affect MySQL workflows. This project
uses PostgreSQL via `@prisma/adapter-pg`, so `mysql2` is never loaded at
runtime. Fixing it requires either downgrading to `prisma@6.19.3` (breaking)
or an upstream `mysql2` patch.

## 5. Risks and trade-offs

- **Removing `next-auth`**: The custom session system must fully cover all
  auth use cases. AUTH-TODO.md shows all phases as checked, and the test
  suite verifies login, logout, password reset, rate limiting, and tenant
  isolation. No regression expected.
- **Bumping `nodemailer`** to v9: The API surface used in `src/lib/mail.ts`
  (`createTransport`, `sendMail`, `Transporter`, `SendMailOptions`) is
  unchanged between v8 and v9. `@types/nodemailer@^8` remains compatible.
- **`package-lock.json` churn**: Removing 4 packages cascades through the
  lockfile (depgraph changes), but the application runtime is unaffected.

## 6. Test plan

- `npx tsc --noEmit` — passes (0 errors, down from 10).
- `npx vitest run src/lib/audit-constants.test.ts` — 9/9 pass in ~50ms.
- `npx vitest run src/lib/auth/__tests__/cookies.test.ts
  src/lib/auth/__tests__/session.test.ts` — pass (2 + 9 = 11 tests).
- `npm run lint` — no new errors introduced (pre-existing errors in
  `payroll/page.tsx`, `settings/page.tsx`, and
  `reset-password/[token]/page.tsx` are unrelated).
- `npm audit` — 2 vulnerabilities remain (mysql2, from prsma CLI).

## 7. Follow-ups

- Track `mysql2` / `prisma` CLI vulnerability until an upstream patch is
  available or Prisma 7 drops the transitive `mysql2` dependency.
- Remove the remaining `next-auth` references in historical change-docs
  (`docs/changes/2026-09-01-implement-fringe-benefit-tax.md` line 134) —
  left as-is since that document is a historical record of a prior change.
- Update `docs/IMPROVEMENTS.md` entries #1 and #2 to reflect the resolved
  auth state (auth is now implemented, not planned).
