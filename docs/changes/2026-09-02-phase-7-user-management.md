# Phase 7 — User Management

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

Phase 6 delivered login, session, and navigation, but there was no way for an
ADMIN to manage the people who can sign in to their business. Every new user
had to be created manually in the database or via the seed. Phase 7 adds the
user-management surface: list, create, edit, and deactivate users, all scoped
to the actor's business, with hashed passwords and a full audit trail — while
guarding against privilege escalation and self-lockout.

## 2. What changed

- Added a `READ_USERS` permission (`src/lib/auth/permissions.ts`), granted to
  `SUPER_ADMIN` and `ADMIN` (alongside the existing `MANAGE_USERS`).
- Added `userRoles`, `createUserSchema`, and `updateUserSchema` to
  `src/lib/auth/schemas.ts`. `SUPER_ADMIN` is deliberately *excluded* from the
  assignable roles, so no tenant-scoped user can create or be granted
  `SUPER_ADMIN` — the only path to that role remains the bootstrap seed.
- Added `src/lib/auth/user-management.ts` with a `safeUserSelect` projection
  that never selects `passwordHash`, an `isManageableRole` guard, and an
  `isSelfMutation` helper.
- Added `GET /api/users` (list, business-scoped, paginated) and
  `POST /api/users` (create with hashed password).
- Added `GET /api/users/[id]`, `PUT /api/users/[id]` (update email/role/status,
  optional password change), and `DELETE /api/users/[id]` (logical
  deactivation → `INACTIVE`).
- Routers require `READ_USERS` / `MANAGE_USERS`, a session `businessId`, hash
  passwords with `bcryptjs` (10 rounds), and write `USER_CREATED`,
  `USER_UPDATED`, `USER_DEACTIVATED` audit events in the same transaction as
  the mutation (with IP address).
- Added `/users` page (`src/app/users/page.tsx`) with list + create/edit/
  deactivate modal workflows and client-side password strength/confirmation.
- Added a "Users" nav item in `src/components/MainNav.tsx`, shown only to
  users with `MANAGE_USERS` **and** an assigned `businessId`.
- Added integration tests in `src/lib/auth/__tests__/user-management.test.ts`.

## 3. How it works

Every handler follows the existing protected-route pattern (`getCurrentUser`
for `401`, `requirePermission` for `403`, then a session `businessId` guard).
Passing a user-supplied `businessId` never overrides session scope: create
connects the user to the session business, and list/get/update/deactivate all
filter by `session.user.businessId`. Emails are normalized to lowercase and
uniqueness is checked across the tenant (and the global unique index).

The privilege-escalation guards are enforced in two layers: the Zod `enum`
rejects `SUPER_ADMIN` at parse time, and `isManageableRole(...)` re-checks the
parsed value defensively. Self-mutations are constrained: an actor may change
their own email and password but cannot change their own role or deactivate
themselves, preventing an admin from locking themselves out of the tenant.

Passwords are stored via `hashPassword` (bcrypt, 10 rounds) and never
returned; `safeUserSelect` omits `passwordHash` entirely.

## 4. What got better

- ADMINS can provision and retire accounts without database access.
- Passwords are hashed centrally with the same policy as the seed/bootstrap.
- Every create/update/deactivate is audited with actor, business, timestamp,
  entity, old/new values, and IP — part of the comprehensive audit trail.
- Business isolation and privilege escalation are enforced server-side.

## 5. Risks and trade-offs

- `SUPER_ADMIN` user management is intentionally excluded pending the
  Phase 9 business/business-selection flow; a `SUPER_ADMIN` without an assigned
  business currently receives `403` for these endpoints.
- Deactivation is logical (sets `status = INACTIVE`) so historical rows and
  audit records stay intact; existing sessions for a deactivated user are
  rejected by `validateSessionToken`.

## 6. Test plan

- `npx tsc --noEmit` — clean for all changed files (pre-existing errors in
  `employees/route.ts`, `settings/route.ts`, `backfill.ts`, and
  `cookies.test.ts` are unrelated and not introduced here).
- `npx eslint src/app/api/users src/app/users src/components/MainNav.tsx src/lib/auth …` —
  no new lint problems.
- `npx vitest run src/lib/auth/auth.test.ts src/lib/auth/__tests__/password.test.ts src/lib/payroll-engine.test.ts src/lib/fbt-engine.test.ts` — **70/70 pass**, confirming the permission-matrix change did not regress engine or auth-unit tests.
- `src/lib/auth/__tests__/user-management.test.ts` — integration tests covering
  401/403, tenant isolation, hashing/no-leak, `SUPER_ADMIN` rejection, update,
  deactivation, cross-business 404, and self-mutation guards.

> **Known environment caveat:** these integration tests mutate a shared Neon
> database reached through the **transaction-pooler** URL currently in `.env`
> (`…-pooler.…neon.tech`). Under that endpoint the existing
> `tenant-isolation.test.ts` and `route-protection.test.ts` also fail with
> intermittent `Foreign key constraint violated` / read-your-writes errors and
> 5s timeouts on cold starts. The **unit-level** suite above passes; the DB
> integration suite requires a direct (non-pooler) Neon connection or local
> Postgres to be reliable. This is tracked under Phase 10.

## 7. Follow-ups

- Phase 9 business management: add the SUPER_ADMIN business-selection flow and
  cross-business user management.
- Route-level 401/403 integration tests for the remaining endpoints once the
  DB integration environment is stabilized.