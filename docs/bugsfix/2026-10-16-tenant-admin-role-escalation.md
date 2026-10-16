# Tenant ADMIN Role Escalation

**Severity:** high
**Date discovered:** 2026-10-16
**Date fixed:** 2026-10-16
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

A business ADMIN could create or promote another user to ADMIN, despite the documented policy that only SUPER_ADMIN provisions business administrators.

## 2. Reproduction

As a business ADMIN, submit `POST /api/users` with `{"email":"second-admin@example.com","password":"StrongPass1","role":"ADMIN"}`, or update a managed user with `PUT /api/users/:id` and `{"role":"ADMIN"}`.

## 3. Impact

A tenant user could grant another account all tenant-administrator capabilities, bypassing the intended provisioning boundary.

## 4. Root cause

`userRoles` included ADMIN, and tenant mutation handlers did not prohibit managing an existing peer ADMIN.

## 5. Fix

Tenant creation and update schemas now permit only PAYROLL_OPERATOR and VIEWER. Tenant mutation handlers also reject changes to another ADMIN account. SUPER_ADMIN business provisioning remains the ADMIN creation path.

## 6. Verification

Added create, promotion, and peer-ADMIN mutation regression cases in `src/lib/auth/__tests__/user-management.test.ts`. The focused suite's new rejection cases passed; other cases encountered remote database transaction timeouts.

## 7. Prevention

Keep tenant-assignable roles narrower than platform-provisioned roles and retain route-level tests for both create and update paths.
