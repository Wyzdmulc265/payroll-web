# Auth Implementation Reference

Technical reference for the custom authentication, authorization,
multi-tenancy, and audit system. Operational (how-to) guidance lives in
[USER-MANAGEMENT-GUIDE.md](./USER-MANAGEMENT-GUIDE.md); the original
requirements are in [AUTH-AUDIT.md](./AUTH-AUDIT.md).

## 1. Why custom sessions (not NextAuth / Supabase Auth)

The application is multi-tenant at the database level (every business
table carries `businessId`), and session identity must be joinable to
that same Prisma schema for tenant-scoped queries and audit rows.
`Session` stores only a **SHA-256 hash** of the opaque token — a DB
leak never exposes usable session tokens. Cookies are
`httpOnly; secure (production); sameSite=lax; path=/`.

## 2. Password hashing

`bcryptjs` with a cost of 10 (`src/lib/auth/password.ts` — `hashPassword`,
`verifyPassword`). Reset tokens are 32 random bytes (base64url); only the
SHA-256 hash is persisted in `PasswordReset` with a 1-hour expiry.

## 3. Data model (auth portion of `prisma/schema.prisma`)

| Model | Key fields / constraints |
| --- | --- |
| `Business` | Tenant root. `SUPER_ADMIN`-managed; owned rows cascade. |
| `User` | `email @unique`, `passwordHash`, `role` enum (`SUPER_ADMIN`, `ADMIN`, `PAYROLL_OPERATOR`, `VIEWER`), optional `businessId` (`SUPER_ADMIN` has none), `isActive`. |
| `Session` | `tokenHash @unique`, `expiresAt`, `userId`. One day TTL. |
| `PasswordReset` | `tokenHash @unique`, `expiresAt` (1 h), single-use. |
| `AuditLog` | `businessId`, `userId`, `action`, `entityType`, `oldValue`/`newValue` JSON, `ipAddress`. `@@index([businessId, timestamp])`. `userId` is `SetNull` on user deletion (actor identity stays nullable by design). |
| `RateLimit` | Fixed-window counters keyed by bucket + identifier. |

## 4. Login / logout flow

1. `POST /api/auth/login` — Zod validation → rate-limit check
   (`MAX_LOGIN_ATTEMPTS` per `RATE_LIMIT_WINDOW_MS`, default 5 / 15 min,
   keyed by IP + email) → user lookup by email (`isActive` only) →
   bcrypt compare → create `Session` (TTL from `SESSION_DURATION_DAYS`,
   default 1) → set cookie → **transactional** audit event
   `LOGIN_SUCCEEDED` (or `LOGIN_FAILED` on bad credentials).
2. `POST /api/auth/logout` — invalidates the session row
   (`deleteMany` on the token hash) and clears the cookie; audit
   `LOGOUT_SUCCEEDED`.
3. 429 responses include a `Retry-After` header.

## 5. Authorization

- **`src/lib/auth/permissions.ts`** — `Permission` enum and a
  role → permission map (single source of truth).
- **`src/lib/auth/authorization.ts`** — `requirePermission`,
  `requireAuth`, `requireBusiness` guards used by every route handler.
- Hierarchy: `SUPER_ADMIN` (platform, businesses, cross-business
  users) > `ADMIN` (own business: users, employees, payroll, settings,
  audit) > `PAYROLL_OPERATOR` (payroll read/write) > `VIEWER` (read).

## 6. Tenant isolation

Every business-owned query is scoped by `businessId` taken from the
**session**, never from client input. Covered by
`src/lib/auth/__tests__/tenant-isolation.test.ts`. `SUPER_ADMIN` has no
implicit payroll access to any business; cross-business flows require
explicit business selection (platform operations only).

## 7. Password reset

`POST /api/auth/forgot-password` always answers 200 (no user
enumeration), creates a hashed one-time token, and emails the link via
`src/lib/mail.ts` (SMTP env vars; falls back to server console logging —
dev only). `POST /api/auth/reset-password` verifies the hash + expiry,
rotates the password, **deletes the token** (single-use), and
invalidates all of the user's sessions.

## 8. Audit policy

`logAuditEvent` (`src/lib/audit.ts`) is the single write path; the
action/entity registries and the pure query builder live in
`src/lib/audit-constants.ts` (type-only Prisma import so client pages
can share them). All auth-route audit writes are transactional with the
state change they describe. Full registry, retention, and the
historical-`system`-row policy: see
`docs/changes/2026-09-03-phase-8-audit-completeness.md`.

## 9. Bootstrap seeding

`prisma db seed` creates the initial `SUPER_ADMIN` from
`BOOTSTRAP_SUPER_ADMIN_EMAIL` / `BOOTSTRAP_SUPER_ADMIN_PASSWORD`.
It is idempotent (skips if a SUPER_ADMIN already exists) and never
deletes data — safe in production. Change the bootstrap password
immediately after first login, or leave the password blank to skip.

## 10. Environment variables

See `.env.local.example` (dev) and `.env.production.example` (prod):
`DATABASE_URL`, `BOOTSTRAP_SUPER_ADMIN_*`, `NEXT_PUBLIC_APP_URL`,
`SESSION_DURATION_DAYS` (1), `MAX_LOGIN_ATTEMPTS` (5),
`RATE_LIMIT_WINDOW_MS` (900000), `SMTP_*`, `NODE_ENV`.

## 11. Deployment notes

- Apply Prisma migrations before starting the new build
  (`prisma migrate deploy` in the release step).
- Cookies are `secure` only when `NODE_ENV=production` — always serve
  production over HTTPS.
- Migrations and seed are non-destructive; no truncation happens in
  production paths.

## 12. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| 401 on every page after deploy | Cookie not sent — check HTTPS and `sameSite=lax`; `NEXT_PUBLIC_APP_URL` mismatch. |
| 429 on login | Rate-limit window not expired; wait or clear `RateLimit` rows. |
| Reset email never arrives | SMTP vars unset → link is on the server console (dev only). Configure SMTP. |
| `P2028` / 500s under load on Neon | Cold compute; routes already use extended transaction timeouts — retry once. |
| "Session expired" after < 1 day | `SESSION_DURATION_DAYS` was lowered, or sessions were invalidated by a password reset. |
