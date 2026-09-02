# Finish Phases 1–6: Auth Foundation Completion and Hardening

**Plan date:** 2026-09-02
**Status:** implementation-ready

---

## 1. Context and Findings

The repository has a substantial auth, audit, and multi-business (tenant)
foundation already built across `src/lib/auth/`, `src/app/api/auth/`,
`src/lib/audit.ts`, `src/proxy.ts`, and the auth UI pages. However, several
items are checked off in `AUTH-TODO.md` that are either **not actually
complete**, **broken**, or **outdated in docs**. The following critical issues
were discovered during the review:

### Critical issues found

1. **Broken test files** (`src/lib/auth/__tests__/session.test.ts`,
   `src/lib/auth/auth.test.ts`):
   - `session.test.ts` imports `generateSessionToken` and
     `invalidateAllUserSessions` — neither exists in `src/lib/auth/session.ts`.
     The actual exports are `createSession(userId, metadata?)`,
     `validateSessionToken(token)` (returns `SessionContext | null`, not
     `{session, user}`), `invalidateSession(token)`,
     `invalidateAllSessionsForUser(userId)`. The test will not compile or pass.
   - `auth.test.ts` calls `checkLoginRateLimit(key)` and
     `clearLoginRateLimit(key)` without `await` — both are async and require a
     live database (they use `prisma.rateLimit`). These tests will hang/fail.
   - Both test files have no `vitest.config.ts` or test-setup isolation; they
     write to the real database.

2. **Employee duplicate check bug** (`src/app/api/employees/route.ts:112`):
   - Uses `prisma.employee.findUnique({ where: { employeeId: ... } })`.
     The schema has `@@unique([employeeId, businessId])` but NOT
     `@unique` on `employeeId` alone. This `findUnique` call is a type
     error and will throw at runtime. It also does not scope by business,
     so a different business could not reuse `EMP001`.

3. **Auth-route audit events are non-transactional**: login, logout,
   forgot-password, and reset-password call `logAuditEvent` **outside** any
   `prisma.$transaction`. If the audit write fails, the primary mutation
   has already committed (and vice-versa).

4. **Outdated `.env.example`**: mentions `NEXTAUTH_URL`/`NEXTAUTH_SECRET`
   (next-auth) but the real bootstrap vars live in `.env.local.example`.
   Should be reconciled.

5. **Outdated docs**: `docs/ARCHITECTURE.md`, `docs/STACK.md`,
   `docs/API.md`, `docs/DATABASE.md` still reference `next-auth`,
   `"system"` audit identity, and the missing auth migration. Need
   comprehensive refresh.

6. **Rate limiter already DB-backed**: AUTH-TODO #85 says "move to shared
   storage" is open, but `rate-limit.ts` already uses the `RateLimit`
   Prisma model. That checkbox is stale; no work needed.

---

## 2. Task List (ordered by dependency)

### Phase 2a — Fix and harden the test suite

**2a.1 Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
```

Create `vitest.setup.ts` that:
- Imports `dotenv/config` to load `.env.local`.
- Sets `process.env.DATABASE_URL` guard.

Rationale: No vitest config exists; tests need a predictable environment.

**2a.2 Rewrite `session.test.ts`** to match the current `session.ts` API.

- Remove imports of `generateSessionToken` / `invalidateAllUserSessions`.
- Test `createSession` (passing `userId`, not token).
- Test `validateSessionToken(token)` returning `SessionContext | null`.
- Test `invalidateSession(token)` (takes token, not sessionId).
- Test `invalidateAllSessionsForUser(userId)`.
- Add tests for: expired session rejection, inactive-user rejection,
  cookie-flag verification (HttpOnly, SameSite, Secure-in-prod).
- Use a dedicated test database or transaction-based isolation.

**2a.3 Fix `auth.test.ts`**

- `await` all async rate-limit calls.
- Add `beforeEach` to clear `RateLimit` table.
- Ensure the test doesn't depend on auth test data leaking between runs.

**2a.4 Add `password.test.ts`**

- Test hashing produces different hashes for the same password (salt
  randomness).
- Test verify rejects wrong passwords.
- Test password policy enforcement (min 8, uppercase, number) via
  `passwordSchema`.

**2a.5 Add `cookies.test.ts`**

- Verify `setSessionCookie` sets `httpOnly: true`, `sameSite: 'lax'`,
  `secure: true` in production.
- Verify `clearSessionCookie` sets `maxAge: 0` and `value: ''`.
- Use `NextResponse` mock objects (no real server needed).

### Phase 1a — Fix the employee duplicate-check bug

**File:** `src/app/api/employees/route.ts:112`

Change:
```ts
const existing = await prisma.employee.findUnique({
  where: { employeeId: validatedData.employeeId },
});
```
To:
```ts
const existing = await prisma.employee.findFirst({
  where: {
    employeeId: validatedData.employeeId,
    businessId: session.user.businessId,
  },
});
```

This fixes both the type error (no `@unique` on `employeeId` alone) and
ensures duplicate detection is scoped to the session's business.

### Phase 1b — Backfill and tenant-field-mandatory decision

- Review `backfill.ts` — it updates `businessId` from `null` to the
  found business on `employees`, `payroll_records`, and `settings`.
  This is the migration path for existing tenant-owned fields.
- **Decision**: Keep `businessId` **nullable** on `Business`-scoped
  models. Rationale: `SUPER_ADMIN` users have no `businessId`, and
  historical `AuditLog` rows have no `userId`. Making these fields
  required would require special sentinel rows or nullable-override
  patterns that complicate the schema more than they help. Document
  this decision in `docs/DATABASE.md`.
- **Decision on employee IDs**: Per-business uniqueness is already
  enforced by `@@unique([employeeId, businessId])`. The `EMP\d{3}`
  format in the Zod schema is a validation convenience, not a global
  constraint. Document this in `docs/DATABASE.md`.
- **Decision on legacy `AuditLog.user` / `PayrollRecord.run_by`**:
  The migration `20260902144109_add_auth_and_business_models` already
  dropped these columns. Historical rows now have `userId: null` and
  `businessId: null`. No archival backfill is possible (columns are
  gone). Document this in `docs/DATABASE.md` under "Historical data".
- Run `npm run prisma:seed` to seed the dev database (the `.env.local`
  bootstrap vars are present).

### Phase 4a — Email delivery for password reset

- Add `nodemailer` as a dependency (no external service required
  for local dev; SMTP-configurable for prod).
- Create `src/lib/mail.ts` with a `sendPasswordResetEmail(to, token)`
  function that:
  - Builds a reset URL: `${NEXT_PUBLIC_APP_URL}/reset-password/${token}`.
  - Uses SMTP config from `process.env.SMTP_*` or a console fallback.
- Wire it into `src/app/api/auth/forgot-password/route.ts:23` where the
  `console.info` stub currently is.
- Add `.env.local.example` entries: `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Document in `docs/STACK.md` and `docs/API.md`.

### Phase 4b — Transactional audit events on auth routes

Wrap each auth-route mutation + its audit event in
`prisma.$transaction`:

- **Login** (`src/app/api/auth/login/route.ts`): create session +
  `LOGIN_SUCCESS` audit in one transaction.
- **Logout** (`src/app/api/auth/logout/route.ts`): invalidate session +
  `LOGOUT` audit in one transaction.
- **Forgot-password** (`src/app/api/auth/forgot-password/route.ts`):
  create `PasswordReset` + `FORGOT_PASSWORD_REQUESTED` audit in one
  transaction.
- **Reset-password** (`src/app/api/auth/reset-password/route.ts`): the
  current code already wraps password-update + token-marking in a
  transaction. Move the `PASSWORD_CHANGED` audit inside that same
  transaction.

### Phase 5a — Route-level 401/403 integration tests

- Create `src/lib/auth/__tests__/route-protection.test.ts`.
- Use `NEXT_RSC_NEGOTIATION` or test the route handlers directly by
  constructing a mock `NextRequest` with/without cookies.
- Test cases:
  - No cookie → 401 on `/api/employees`, `/api/payroll`, `/api/settings`.
  - Invalid/expired token → 401.
  - Valid session but wrong role (e.g. `VIEWER` hitting
    `POST /api/employees`) → 403.
  - Valid session + correct role → 200.
- Use `next-test-api-route` helper pattern: import the route handler
  function and invoke it with a constructed `NextRequest`.

### Phase 5b — Cross-business isolation tests

- Create `src/lib/auth/__tests__/tenant-isolation.test.ts`.
- Seed two businesses, each with an `ADMIN` user and an employee.
- Assert:
  - Business A's admin cannot read Business B's employees (404 or empty).
  - Business A's payroll run cannot see Business B's settings.
  - Business A's admin cannot DELETE/patch Business B's settings.
  - Super-admin cannot read Business A's payroll without explicit
    business context (the proxy blocks `/api/*` for no-cookie; the
    route handler returns 401 for no `businessId`).

### Phase 5c — Transaction-wrapped audit on business mutations (existing)

- Audit: Employee create/update/deactivate (`employees/[id]/route.ts`),
  payroll save (`payroll/route.ts`), and settings (`settings/route.ts`)
  **already** use `prisma.$transaction` with `logAuditEvent(..., tx)`.
  Verify this is correct and mark as done.
- The only gaps are the auth routes (Phase 4b).

### Phase 6a — Browser smoke tests (Playwright)

- Install `playwright` and `@playwright/test` as dev dependencies.
- Create `e2e/smoke/auth.spec.ts`:
  - Navigate to `/dashboard` without cookies → redirected to
    `/login?from=/dashboard`.
  - Navigate to `/login` → form is visible, email/password fields work.
  - Submit invalid credentials → 401 error shown.
  - Submit valid credentials (using seeded `admin@testbiz.local` /
    `AdminTest123`) → redirected to `/dashboard`, nav shows user email.
  - Click "Log out" → redirected to `/login`, session cookie cleared.
  - Verify `VIEWER` user does not see Settings nav item.
- Add `e2e/playwright.config.ts` with the base URL pointing to
  `http://localhost:3000`.

---

## 3. Documentation Updates (mandatory, per `docs/AI-DOCUMENTATION-INSTRUCTIONS.md`)

Every code change above must be accompanied by a `docs/changes/<date>-<slug>.md`
file. Additionally, the following existing docs are stale and must be refreshed:

### 3.1 `docs/ARCHITECTURE.md`

- Replace §6 "Auth (Current State and Roadmap)" (lines 194–217) —
  the current state is the custom session system (not the
  "not yet wired" next-auth plan). Document the real flow: login →
  `createSession` → `paySession` cookie → `getSessionContext` in
  handlers → `src/proxy.ts` gate.
- Update the layered diagram to include `src/lib/auth/` and
  `src/lib/audit.ts` in the API layer.
- Update the request lifecycle cheat-sheet (§11) to include session
  validation step.

### 3.2 `docs/STACK.md`

- Remove §6 "Authentication (Declared, To Be Wired)" — next-auth is
  installed but intentionally unused; document it as "pre-installed but
  superseded by the custom session system."
- Expand §4 "Node.js crypto" to describe the session token lifecycle:
  generation, SHA-256 hashing, one-day TTL, IP/UA storage.
- Note that `bcryptjs` is now actively used (10 rounds), not just
  "declared."

### 3.3 `docs/API.md`

- Update §Common Error Responses to include 429 (rate-limited login).
- Fix line 98: `AuditLog` action is now `'EMPLOYEE_CREATED'` (not
  `'CREATE'`), and `user` is the resolved email, not `'system'`.
- Add auth endpoints to the response-status code table.
- Document the `Retry-After` header on 429 responses.

### 3.4 `docs/DATABASE.md`

- Update §1.1 to add the auth models: `User`, `Session`,
  `PasswordReset`, `Business`.
- Add migration `20260902144109_add_auth_and_business_models` to §7.
- Document employee ID uniqueness decision (per-business).
- Document `businessId` nullability decision (kept nullable for
  SUPER_ADMIN and historical rows).
- Document that legacy `AuditLog.user` and `PayrollRecord.run_by`
  columns were dropped (no archival backfill).

### 3.5 `docs/UI.md`

- Update the persistent shell section (§1) to reference
  `UserProvider` in `layout.tsx`, `src/proxy.ts` as the gate, and the
  auth-hiding behavior in `MainNav`.

### 3.6 `docs/changes/2026-09-02-phase-6-login-ui-and-proxy.md`

- Update the "Follow-ups" section: the Playwright smoke tests are
  now being added (link to the new `e2e/` spec).

### 3.7 New change docs

- `docs/changes/2026-09-02-fix-broken-auth-tests.md` — rewriting
  `session.test.ts` and `auth.test.ts`.
- `docs/changes/2026-09-02-fix-employee-duplicate-check.md` — the
  `findUnique` → `findFirst` fix.
- `docs/changes/2026-09-02-auth-route-transactional-audit.md` —
  moving audit events inside transactions.
- `docs/changes/2026-09-02-email-delivery-password-reset.md` —
  adding `nodemailer` + `src/lib/mail.ts`.
- `docs/changes/2026-09-02-auth-integration-tests.md` — 401/403 and
  cross-business tests.
- `docs/changes/2026-09-02-browser-smoke-tests.md` — Playwright spec.
- `docs/changes/2026-09-02-refresh-auth-documentation.md` —
  ARCHITECTURE/STACK/API/DATABASE/UI updates.

---

## 4. Open Questions / Decisions

1. **Email provider**: Should we use `nodemailer` with SMTP (no new
   external service / cost) or integrate a provider like SendGrid/Resend?
   Recommendation: **nodemailer** — zero new external dependency,
   works for local dev and can point at any SMTP in prod. If SendGrid is
   preferred, swap `src/lib/mail.ts` internals only.

2. **Test DB strategy**: Should tests use a real PostgreSQL dev DB
   (current approach) or an in-memory SQLite? Recommendation: keep
   PostgreSQL — Prisma driver-adapter is pg-specific, and the tests
   need to exercise the real tenant-scoping SQL. Add a `DATABASE_URL_TEST`
   env var for isolation, or truncate tables in `beforeEach`.

3. **Employee ID format**: `EMP\d{3}` gives only 1000 employees per
   business. Should we relax to `EMP\d{4}` or remove the regex?
   Recommendation: leave as-is for now; document the 1000-employee
   ceiling. Address in a future improvement.

4. **SUPER_ADMIN business access**: The AUTH-TODO Phase 9 says
   "Ensure SUPER_ADMIN cannot implicitly read or mutate business
   payroll without an explicit support/business-selection flow."
   This is **out of scope** for phases 1–6 but should be flagged.

---

## 5. Validation Plan

After implementation, the following must pass:

```bash
npx tsc --noEmit      # zero type errors
npx vitest run        # all unit + auth tests pass
npx eslint .          # zero lint errors
npx playwright test   # smoke tests pass (dev server running)
```

Acceptance criteria from `AUTH-TODO.md` Phase 1–6 that must be green:

- [ ] Session expiry/invalidation and cookie-flag integration tests pass
- [ ] Auth-route integration tests pass (401, 403, 429, reset flow)
- [ ] Cross-business tenant-isolation tests pass
- [ ] Browser smoke tests for login, redirect, logout pass
- [ ] `prisma db seed` runs successfully with bootstrap vars
- [ ] `docs/STACK.md` updated with bcryptjs + session design
- [ ] `docs/API.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`,
      `docs/UI.md` refreshed
- [ ] All `AUTH-TODO.md` Phase 1–6 checkboxes are marked complete
