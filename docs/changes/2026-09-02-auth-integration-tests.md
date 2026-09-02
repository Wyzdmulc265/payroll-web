# Auth integration tests (401/403 and tenant isolation)

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

There were no tests for route-level auth enforcement. A regression in
`getCurrentUser`, `requirePermission`, or the per-business scoping could
go undetected.

## 2. What changed

- Added `src/lib/auth/__tests__/route-protection.test.ts`:
  - No cookie → 401 on `GET /api/employees`.
  - Invalid/expired token → 401.
  - VIEWER hitting `POST /api/employees` → 403.
  - ADMIN hitting `GET /api/employees` → 200.
- Added `src/lib/auth/__tests__/tenant-isolation.test.ts`:
  - Business A admin reads employees → only Business A's employees
    returned.
  - Business A admin can create employees in their own business → 201.
  - SUPER_ADMIN without `businessId` hitting `GET /api/employees` → 403.

## 3. How it works

Tests construct `NextRequest` objects with/without cookies and invoke
the route handlers directly. Sessions are created directly in Prisma
with SHA-256 hashed tokens so `validateSessionToken` can resolve them.

## 4. What got better

- 7 new integration tests cover the auth boundary.
- Tenant scoping is verified at the route level, not just in the UI.

## 5. Risks and trade-offs

- Tests write to the real database; isolation is via `beforeEach`
  truncation.
- Route handlers are imported directly, bypassing the Next.js server.
  This is a unit-test approach, not a full end-to-end test.

## 6. Test plan

- `npx vitest run src/lib/auth/__tests__/route-protection.test.ts` → 4
  tests pass.
- `npx vitest run src/lib/auth/__tests__/tenant-isolation.test.ts` → 3
  tests pass.

## 7. Follow-ups

- Add tests for the remaining auth routes (login, logout,
  forgot-password, reset-password).
- Add Playwright smoke tests for the full browser flow.
