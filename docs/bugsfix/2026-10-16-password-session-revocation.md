# Password Changes Must Revoke Sessions

**Severity:** high
**Date discovered:** 2026-10-16
**Date fixed:** 2026-10-16
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

Admin-driven password resets left the target's active sessions usable. Self-service password updates committed before session revocation, allowing a failure between those steps to retain old sessions.

## 2. Reproduction

Keep a valid session for an operator, have a tenant ADMIN reset that user's password through `PUT /api/users/:id`, then reuse the original cookie. Repeat with a SUPER_ADMIN reset through the business-admin endpoint.

## 3. Impact

A previously compromised or shared session could remain authorized after credentials were changed or an account was deactivated.

## 4. Root cause

Tenant user updates did not invalidate sessions; self-service invalidation ran outside the password transaction; platform administrator management did not revoke sessions.

## 5. Fix

Session deletion now occurs in the same transaction as password changes and deactivation in self-service, tenant user management, and SUPER_ADMIN admin-management handlers. See `docs/API.md`.

## 6. Verification

Added integration assertions for admin password reset and deactivation in `src/lib/auth/__tests__/user-management.test.ts` and `src/app/api/admin/__tests__/admins.test.ts`. Existing self-service tests cover all-session invalidation. The remote DB caused transaction timeout failures in the focused integration run.

## 7. Prevention

Treat credential/status mutation and session revocation as one atomic state transition; test the persisted session count after each mutation path.
