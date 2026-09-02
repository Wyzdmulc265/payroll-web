# Add Authentication and Business Isolation Foundation

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

The payroll API was public, stored audit identity as `system`, and had no database boundary between businesses. This foundation adds the identity and tenant primitives required for secure role-based access.

## 2. What changed

- Added Business, User, Session, and PasswordReset models and role/status enums.
- Added business ownership fields and relations to employees, payroll, settings, and audit logs.
- Added bcrypt password hashing, opaque one-day sessions, HttpOnly cookies, logout, current-user, and password reset endpoints.
- Added role permissions and an in-memory five-attempt/15-minute login limiter.
- Protected employee, payroll, dashboard, FBT, payslip, report, and settings API boundaries with authentication and business scoping.
- Updated seed data to bootstrap `BOOTSTRAP_SUPER_ADMIN_EMAIL` and `BOOTSTRAP_SUPER_ADMIN_PASSWORD`.

## 3. How it works

Session tokens are generated with `crypto.randomBytes`, stored only as SHA-256 hashes, and validated against active, unexpired database sessions. Normal users must have a matching `businessId` on every business-owned query. `SUPER_ADMIN` is intentionally not granted implicit payroll access.

## 4. What got better

Before, any caller could read or mutate payroll data and actions were attributed to `system`. After, protected routes require an active session, role permissions are centralized, and core queries carry the authenticated business scope. The payroll engine remains unchanged and side-effect free.

## 5. Risks and trade-offs

- Existing databases require a migration and a data backfill before production use.
- The login limiter is process-local and should move to shared storage for multiple instances.
- Password reset delivery is not yet connected to an email provider; tokens are currently only logged server-side.
- Some existing payroll route calls still have unrelated type drift against the current engine API and need a separate repair.

## 6. Test plan

- `npx prisma validate` passes.
- Prisma client generation passes.
- `npx prisma migrate dev --name add_auth_and_business_models` completed successfully against the configured PostgreSQL database.
- Existing payroll and FBT tests pass: 63 tests.
- Touched auth and protected route files report no diagnostics; full type-check still reports the existing `workingDaysInPeriod` engine contract drift in three callers.
- Add endpoint integration tests for 401, 403, session expiry, reset-token use, and cross-business access before production deployment.

## 7. Follow-ups

- Add and apply the Prisma migration with a reviewed backfill strategy.
- Decide whether historical `audit_logs.user` and `payroll_records.run_by` values should be preserved in a one-time archival migration; the generated migration currently drops those legacy columns.
- Complete route-level authorization for any remaining API endpoints and add integration tests.
- Build the login/reset UI and connect password reset delivery.
- Update `docs/API.md`, `docs/DATABASE.md`, and `docs/ARCHITECTURE.md` for the final auth contract.
