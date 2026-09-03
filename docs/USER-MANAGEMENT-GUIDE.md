# User & Business Management Guide

Operational guide for SUPER_ADMINs and ADMINs: creating users and
businesses, roles, resets, and day-to-day admin tasks. Technical
internals: [AUTH-IMPLEMENTATION.md](./AUTH-IMPLEMENTATION.md).

## 1. Roles at a glance

| Role | Scope | Can do |
| --- | --- | --- |
| **SUPER_ADMIN** | Platform-wide | Manage businesses (`/businesses`), manage users in any business, no payroll data access by default. |
| **ADMIN** | Own business | Everything in their business: users, employees, payroll runs, settings, payslips, reports, audit logs. |
| **PAYROLL_OPERATOR** | Own business | Run/save payroll, manage employees, view payslips/reports. No users, no settings, no audit logs. |
| **VIEWER** | Own business | Read-only on employees, payslips, reports. |

**Permission matrix** (single source of truth:
`src/lib/auth/permissions.ts`):

| Capability | SUPER_ADMIN | ADMIN | PAYROLL_OPERATOR | VIEWER |
| --- | :-: | :-: | :-: | :-: |
| Manage businesses | ✓ | — | — | — |
| Cross-business users | ✓ | — | — | — |
| Manage users (own biz) | — | ✓ | — | — |
| Manage employees | — | ✓ | ✓ | — |
| Run / save payroll | — | ✓ | ✓ | — |
| View payslips / reports | — | ✓ | ✓ | ✓ |
| Manage settings | — | ✓ | — | — |
| View audit logs | — | ✓ | — | — |

## 2. First-run bootstrap

1. Set `BOOTSTRAP_SUPER_ADMIN_EMAIL` and
   `BOOTSTRAP_SUPER_ADMIN_PASSWORD` before `prisma db seed`.
2. The seed creates the SUPER_ADMIN if none exists (idempotent,
   non-destructive in production).
3. **Log in immediately and change the password**, or clear the env
   vars afterwards. Anyone with the bootstrap vars can re-run the seed
   path.

## 3. Managing businesses (SUPER_ADMIN)

`/businesses` → `GET/POST /api/businesses`,
`GET/PUT/PATCH/DELETE /api/businesses/[id]`.

- **Create** a business with a name; optionally assign its first ADMIN
  user (email + strong password) in the same step.
- **Rename** (`PUT`) — audited as `BUSINESS_UPDATED` with old/new names.
- **Lifecycle** (`PATCH`) — `ACTIVE` ⇄ `SUSPENDED`. Suspending a
  business deletes its active sessions immediately (users are logged
  out) and blocks new logins. Reactivate to restore access.
- **Delete** (`DELETE`) — soft pattern: business rows and owned data
  cascade per schema; this is destructive and audited
  (`BUSINESS_DELETED`). Prefer suspension unless the tenant is truly
  gone.

## 4. Managing users (ADMIN)

`/users` → `GET/POST /api/users`, `PUT/DELETE /api/users/[id]`.

- Create users in your business with one of the three non-SUPER roles.
- **Deactivate** (`DELETE`) instead of deleting: `isActive=false`
  preserves audit history and employee links; sessions are invalidated
  immediately.
- Password rules (enforced server-side by Zod): minimum 8 characters,
  at least one uppercase letter, and at least one number. Users reset
  their own password via "Forgot password" on the login screen.
- ADMINs can manage only users **inside their own business**;
  cross-business user management is SUPER_ADMIN-only.

## 5. Password resets & session invalidation behavior

| Event | Sessions affected |
| --- | --- |
| Self password change | Others invalidated, current session kept. |
| Password reset via email token | **All** sessions invalidated. |
| User deactivated | All of that user's sessions invalidated. |
| Business suspended | All sessions of all its users invalidated. |
| Forgot/reset token | Single-use, hashed, expires after 1 hour. |

## 6. Audit trail for admins

ADMINs see `/audit-logs`: filter by date/action/entity, expand rows for
old/new JSON, export CSV of the current page. Every login, logout,
reset, user/business change, payroll save, settings change, and report
export is recorded with actor, IP, and business scope.

## 7. Common tasks & troubleshooting

| Task | How |
| --- | --- |
| A user is locked out (429) | Wait out the rate-limit window (default 15 min); it clears automatically. |
| Force a user out everywhere | Deactivate/reactivate the user, or trigger a password reset. |
| New joiner needs payroll access | Create a `PAYROLL_OPERATOR` in `/users`; no settings or audit access. |
| "No business" error for a SUPER_ADMIN | Expected — SUPER_ADMIN has no payroll scope; select/operate via the businesses API. |
| Reset email not received | Check SMTP config (docs/AUTH-IMPLEMENTATION.md §7); dev mode logs the link to the server console. |
