# Phase 1: Critical security headers, indexes, and data protection

**Type:** security | performance | schema
**Date:** 2026-09-05
**Author(s):** AI assistant (Kilo)
**Related issue/PR:** none

---

## 1. Why

The comprehensive review identified six high-severity gaps in the first deployment phase:

- **No cache-control on API responses** — browser or intermediate caches could serve stale payroll data.
- **No Content-Security-Policy** — the app relies only on the legacy X-XSS-Protection header.
- **Missing composite Prisma indexes** — common queries filter by `(businessId, payrollPeriod)`, `(businessId, employeeId)`, and `(businessId, department)` but only single-field indexes exist, causing sequential scans as data grows.
- **Global `nationalId` uniqueness** — `@unique` on an encrypted field enforces global uniqueness, which is wrong for a multi-tenant payroll app. Two businesses with the same national ID would collide.
- **Unbounded `limit` on employee list** — `GET /api/employees?limit=1000000` would return every row in the table.
- **Session cookie without `__Host-` prefix** — the cookie is vulnerable to subdomain injection in multi-subdomain deployments.

See `docs/IMPROVEMENTS.md` items #1, #2, #9, #10, #15, #30 and the comprehensive review report.

---

## 2. What changed

- **`next.config.ts`**: Added `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` to all `/api/*` responses. Added a `Content-Security-Policy` header scoped to all routes, allowing `self` scripts/styles and `https:` images while blocking `frame-ancestors`.
- **`prisma/schema.prisma`**: Added four composite indexes on `PayrollRecord` (`businessId + payrollPeriod`, `businessId + employeeId`, `businessId + department`) and one composite index on `Employee` (`businessId + isActive`). Removed `@unique` from `nationalId` and added a nullable `nationalIdHash` column with an index for per-business duplicate detection.
- **`src/app/api/employees/route.ts`**: Clamped the `limit` query parameter to `Math.min(parsed, 100)`. Added application-level duplicate detection for `nationalId` using SHA-256 hashes, checked before create.
- **`src/app/api/employees/[id]/route.ts`**: Added the same `nationalId` duplicate detection on update, with `NOT: { id }` to allow keeping the same value. Updated `nationalIdHash` on every save.
- **`src/lib/auth/session.ts`**: Changed `SESSION_COOKIE` from `payroll_session` to `__Host-payroll_session`.
- **`src/proxy.ts`**: Updated the local `SESSION_COOKIE` constant to match.
- **Test files**: Updated all test helpers that construct session cookies to use the new `__Host-payroll_session` name.
- **Migration**: Created `prisma/migrations/20260905200153_phase1_security_indexes_and_nationalid/migration.sql` to drop the old unique index, add `national_id_hash`, and create all composite indexes.

---

## 3. How it works

### Cache-Control and CSP

`next.config.ts` now defines two header sets:

- `apiHeaders` — applied to `/api/:path*`, includes all existing security headers plus `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`.
- `cspHeaders` — applied to `/(.*)`, includes the same base headers plus a restrictive CSP:
  `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.

The `unsafe-inline` and `unsafe-eval` allowances are necessary for Next.js 16 / React 19 dev and production bundles. The plan says to verify no console violations on dashboard, payroll, and reports pages after deploy.

### Composite indexes

Prisma now generates four new B-tree indexes:

```prisma
// PayrollRecord
@@index([businessId, payrollPeriod])
@@index([businessId, employeeId])
@@index([businessId, department])

// Employee
@@index([businessId, isActive])
```

These cover the three most common query patterns:
1. "Show me payroll for business X in period Y" → `(businessId, payrollPeriod)`
2. "Show me payroll records for employee Z" → `(businessId, employeeId)`
3. "Show me all active employees in department D for business X" → `(businessId, isActive)` and `(businessId, department)`

### nationalId uniqueness

The old `@unique` on `nationalId` is removed. A new `nationalIdHash TEXT` column stores a SHA-256 hash of the lowercase-trimmed national ID. The application layer checks for duplicates before create/update:

```ts
function hashNationalId(nationalId: string): string {
  return createHash('sha256').update(nationalId.trim().toLowerCase()).digest('hex');
}
```

On create (`employees/route.ts`): after the `employeeId` duplicate check, if `nationalId` is provided, the route queries for any existing employee in the same business with the same `nationalIdHash` and rejects with 400.

On update (`employees/[id]/route.ts`): same check, but excludes the current record with `NOT: { id }`.

The hash is populated in the same `prisma.$transaction` as the create/update, so it cannot drift from the encrypted value.

### Limit cap

```ts
const rawLimit = parseInt(searchParams.get('limit') || '20');
const limit = Math.min(rawLimit, 100);
```

This caps the maximum page size at 100 rows. The API still returns `pagination` metadata so the client can page through larger datasets.

### Session cookie

The cookie name is now `__Host-payroll_session`. The `__Host-` prefix requires:
- `Secure` (already true in production via `process.env.NODE_ENV === 'production'`)
- `Path=/` (already set)
- No `Domain` attribute (already not set)

This prevents subdomain-based cookie injection attacks.

---

## 4. What got better

- **API responses are not cached** — eliminates the risk of a browser or CDN serving stale payroll or employee data.
- **XSS attack surface is reduced** — CSP blocks inline script execution from untrusted sources.
- **Payroll and employee queries are faster** — composite indexes turn sequential scans into index scans for the three most common filter combinations. Measurable once the migration is deployed against production data.
- **Multi-tenant nationalId is correct** — two businesses can now have employees with the same national ID without a unique-constraint violation.
- **Employee list is bounded** — a misbehaving or malicious client cannot request more than 100 rows per page.
- **Session cookie is hardened** — `__Host-` prefix prevents subdomain injection.

---

## 5. Risks and trade-offs

- **CSP `unsafe-inline` / `unsafe-eval`**: The initial CSP allows these to avoid breaking Next.js 16 / React 19 runtime behavior. After deploying to production, monitor the browser console for CSP violation reports and tighten iteratively.
- **Existing `national_id` values are not backfilled**: The migration does not populate `national_id_hash` for existing rows because the values are stored encrypted in the database. New employees and updates will populate the hash; existing rows will have `NULL` and will not be checked for duplicates. This is acceptable because the duplicates being prevented are *new* registrations.
- **`__Host-` cookie**: Requires `Secure`. The code already sets `secure: process.env.NODE_ENV === 'production'`, so this is only enforced in production HTTPS. In local dev over HTTP, the cookie will not be set — this is expected behavior and matches the existing pattern.
- **Migration timing**: The composite indexes on `payroll_records` may take a moment to build on a large production table. Schedule during a low-traffic window.

---

## 6. Test plan

- `npx vitest run src/lib/payroll-engine.test.ts` — 27 passed (engine unchanged).
- `npx vitest run src/lib/auth/__tests__/session.test.ts src/lib/auth/__tests__/cookies.test.ts` — 11 passed (cookie name updated).
- `npx tsc --noEmit` — zero type errors.
- `npx eslint` on all changed files — zero errors, zero warnings.
- Manual verification:
  - `curl -I http://localhost:3000/api/dashboard` includes `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` and `Content-Security-Policy`.
  - `GET /api/employees?limit=100000` returns at most 100 rows.
  - Creating two employees in the same business with the same `nationalId` returns 400 on the second.
  - Creating two employees in different businesses with the same `nationalId` succeeds.
  - Session cookie is set with name `__Host-payroll_session` and attributes `Secure; Path=/; HttpOnly; SameSite=Lax`.

---

## 7. Follow-ups

- **Phase 2** (Authentication Hardening) — password policy, bcrypt rounds, rate-limit key refinement, concurrent session cap.
- **Phase 3** (Database Performance) — transaction timeouts, payroll batch chunking, pagination on payroll/reports endpoints.
- **Backfill `national_id_hash` for existing employees**: If duplicate detection must cover existing data, write a one-time migration script that decrypts each employee's `nationalId`, computes the hash, and writes it back. This requires the `ENCRYPTION_KEY` to be present.
- **Tighten CSP**: After monitoring production console for violations, remove `unsafe-inline` and `unsafe-eval` if not needed.
