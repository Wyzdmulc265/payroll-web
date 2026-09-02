# Auth-route transactional audit events

**Type:** refactor
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

Login, logout, forgot-password, and reset-password called `logAuditEvent`
outside `prisma.$transaction`. If the audit write failed, the primary
mutation had already committed (and vice-versa), breaking the atomicity
guarantee that the rest of the codebase already follows.

## 2. What changed

- **Login** (`src/app/api/auth/login/route.ts`): `createSession` +
  `LOGIN_SUCCESS` audit now run in one `prisma.$transaction`.
- **Logout** (`src/app/api/auth/logout/route.ts`): `invalidateSession` +
  `LOGOUT` audit now run in one transaction.
- **Forgot-password** (`src/app/api/auth/forgot-password/route.ts`):
  `PasswordReset` creation + `FORGOT_PASSWORD_REQUESTED` audit now run
  in one transaction. Email delivery (`sendPasswordResetEmail`) happens
  after the transaction commits.
- **Reset-password** (`src/app/api/auth/reset-password/route.ts`): the
  `PASSWORD_CHANGED` audit was moved inside the existing transaction
  that updates the password hash and marks the token as used.

## 3. How it works

`createSession` and `invalidateSession` in `src/lib/auth/session.ts`
now accept an optional `Prisma.TransactionClient` parameter. When
provided, they use the transaction client instead of the global `prisma`
singleton. This lets the route handlers wrap the mutation + audit in a
single transaction without duplicating session logic.

`logAuditEvent` already supports an optional `tx` parameter; when
provided, errors are thrown to abort the transaction.

## 4. What got better

- Auth mutations are now atomic with their audit trail.
- Failure of either the mutation or the audit write rolls back the
  entire transaction.

## 5. Risks and trade-offs

- Login now holds a DB transaction for the duration of session creation
  + audit write. This is a single-row insert and a single-row insert,
  so the lock duration is negligible.

## 6. Test plan

- `npx vitest run` → 88 tests pass.
- Manual smoke test: login creates a session and an `AuditLog` row; if
  the audit write were to fail, the session would not be created.

## 7. Follow-ups

- Apply the same pattern to any remaining auth-adjacent routes that
  write audit events outside transactions.
