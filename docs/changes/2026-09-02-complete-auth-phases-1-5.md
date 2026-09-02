# Complete Authentication and Audit Phases 1-5

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

Phases 1-5 needed to be completed so the payroll API could authenticate users, enforce roles, isolate businesses at the database query boundary, and preserve who performed auditable actions. The work follows the authentication and audit requirements in `docs/AUTH-AUDIT.md`.

## 2. What changed

- Added shared Zod schemas and a password policy requiring eight characters, one uppercase letter, and one number.
- Added focused auth tests for password hashing, permissions, business access, and five-attempt rate limiting.
- Added a reusable audit helper with request IP extraction and actor/business metadata.
- Added login success/failure, logout, forgot-password, password-changed, employee, payroll, and settings audit events.
- Protected payroll calculation and completed tenant scoping for core dashboard, employee, payroll, settings, reports, FBT, and payslip routes.
- Added `.env.local.example` for bootstrap, session, and rate-limit configuration.
- Corrected seed cleanup ordering and documented the auth schema in `docs/API.md` and `docs/DATABASE.md`.

## 3. How it works

Protected routes resolve the opaque session cookie, reject inactive or expired sessions, check the centralized permission map, and require a matching business ID. Audit calls use `logAuditEvent()` to serialize before/after values and write actor, business, and request IP fields. The payroll engine remains unchanged and side-effect free.

## 4. What got better

Before, payroll previews were public, settings and reports had incomplete protection, and audit events were written directly with inconsistent fields. After, core routes require authentication and role permission, tenant scope is supplied by the session, and mutation events use consistent named actions and metadata. Four auth unit tests were added and all existing payroll/FBT tests remain passing.

## 5. Risks and trade-offs

- The in-memory limiter is suitable for one process only; shared storage is required for multiple application instances.
- Audit helper failures are logged server-side but do not currently fail the business request; transactional audit writes remain follow-up work.
- Password reset email delivery is not implemented.
- Legacy audit and payroll actor values were already dropped by the applied schema migration and need an archival decision if historical preservation is required.
- Tenant columns remain nullable during the migration period.

## 6. Test plan

- `npx prisma validate`
- `npx prisma migrate status`
- `npx tsc --noEmit` passes.
- `npx vitest run src/lib/auth/auth.test.ts`
- `npm test` passes: 67 tests.
- `npm run lint` remains blocked by pre-existing React hook errors in `src/app/payroll/page.tsx`; no auth/audit lint errors were introduced.
- Verify protected route files have no editor diagnostics.
- Run `prisma db seed` after setting bootstrap variables, then verify tenant ownership in Prisma Studio.

## 7. Follow-ups (optional)

- Add auth-route, route authorization, tenant-isolation, and audit completeness integration tests.
- Add the audit-log API/viewer and user/business management phases.
- Wrap mutations and their audit events in a single database transaction.
- Update `docs/ARCHITECTURE.md` and `docs/STACK.md` with the final auth flow.
