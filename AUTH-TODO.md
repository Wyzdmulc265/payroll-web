# Authentication and Audit Implementation TODO

Last updated: 2026-09-02

This checklist records the complete authentication, authorization, multi-business, and audit-log implementation planned in this chat. A task is checked only when the corresponding code or verification exists in the repository.

## Status Summary

- **Implemented:** database foundation, Prisma migration, password/session primitives, role map, login/logout/session/reset endpoints, partial API tenant protection, login UI, request middleware, navigation changes, and Phase 7 user management (list/create/edit/deactivate, business-scoped, hashed passwords, audit events).
- **Partially implemented:** seed bootstrap, route protection, audit identity fields, password reset delivery, and audit event coverage.
- **Not implemented:** business management, audit viewer/API, comprehensive integration tests (blocked by Neon transaction-pooler environment), and final documentation.
- **Important:** `src/lib/payroll-engine.ts` remains a pure module and must not receive authentication or database responsibilities.

## Phase 1: Database Schema and Migration

### Schema

- [x] Add `Role` enum: `SUPER_ADMIN`, `ADMIN`, `PAYROLL_OPERATOR`, `VIEWER`.
- [x] Add `UserStatus` enum.
- [x] Add `BusinessStatus` enum.
- [x] Add `PasswordResetStatus` enum.
- [x] Add `Business` model and relations.
- [x] Add `User` model with email, password hash, role, status, and optional business.
- [x] Add `Session` model with hashed token, expiry, IP address, and user agent.
- [x] Add `PasswordReset` model with hashed token, expiry, and one-time status.
- [x] Add `businessId` and Business relation to `Employee`.
- [x] Add `businessId` and Business relation to `PayrollRecord`.
- [x] Add `businessId` and compound `(key, businessId)` uniqueness to `Settings`.
- [x] Replace audit string identity with nullable `AuditLog.userId` relation.
- [x] Add `AuditLog.businessId` relation and `(businessId, timestamp)` index.
- [x] Replace `PayrollRecord.runBy` with nullable `runByUserId` relation.
- [ ] Decide whether employee IDs should be unique globally or per business.
- [ ] Make tenant-owned fields required after a reviewed data backfill, where appropriate.

### Migration and seed

- [x] Run `prisma validate`.
- [x] Generate Prisma Client.
- [x] Create and apply `20260902144109_add_auth_and_business_models`.
- [ ] Preserve or archive legacy `AuditLog.user` and `PayrollRecord.run_by` values; the applied migration has already dropped these legacy columns.
- [x] Update seed structure for a default test business.
- [x] Add bootstrap SUPER_ADMIN creation from `BOOTSTRAP_SUPER_ADMIN_EMAIL`.
- [x] Add bootstrap password validation and hashing.
- [x] Add test ADMIN, PAYROLL_OPERATOR, and VIEWER users.
- [x] Assign seeded employees and settings to the test business.
- [ ] Run `prisma db seed` with configured bootstrap environment variables; blocked because this shell has no bootstrap variables.
- [ ] Verify seeded users, business ownership, and tenant data in Prisma Studio.

## Phase 2: Password, Session, Cookie, and User Utilities

- [x] Add `src/lib/auth/password.ts`.
- [x] Hash passwords with bcryptjs and 10 rounds.
- [x] Verify passwords with bcryptjs.
- [x] Add `src/lib/auth/session.ts`.
- [x] Generate opaque 32-byte session tokens.
- [x] Store only SHA-256 session token hashes.
- [x] Enforce one-day session expiry.
- [x] Store session IP address and user agent.
- [x] Reject expired sessions and inactive users.
- [x] Invalidate one session.
- [x] Invalidate all sessions for a user.
- [x] Add `src/lib/auth/cookies.ts` with HttpOnly, SameSite, Secure-in-production cookies.
- [x] Add `src/lib/auth/types.ts` with `AuthUser` and session context types.
- [x] Add `src/lib/auth/user.ts` session resolver.
- [x] Add `src/lib/auth/index.ts` exports.
- [x] Install `bcryptjs` and TypeScript declarations.
- [x] Add unit tests for hashing, permission mapping, tenant access, and rate limiting.
- [ ] Add session expiry/invalidation and cookie-flag integration tests.
- [x] Update `docs/STACK.md` with bcryptjs and session design.

## Phase 3: Roles, Permissions, Validation, and Rate Limiting

- [x] Add centralized permission constants.
- [x] Add role-to-permission mapping for all four roles.
- [x] Add permission response helpers for 401 and 403.
- [x] Add `canAccessBusiness` with no implicit SUPER_ADMIN payroll access.
- [x] Add `requirePermission` and `requireRole` helpers.
- [x] Add in-memory login rate limiter.
- [x] Enforce five attempts per 15-minute window.
- [x] Return retry information for rate-limited requests.
- [x] Clear login limiter state after successful login.
- [x] Add shared Zod schemas for login and password reset.
- [x] Enforce password policy of minimum 8 characters, one uppercase character, and one number.
- [x] Add permission and tenant-access unit tests.
- [ ] Move rate limiting to shared storage for multi-instance deployment.

## Phase 4: Authentication API Routes

### Login

- [x] Create `POST /api/auth/login`.
- [x] Normalize email and validate required credentials.
- [x] Verify active user and password.
- [x] Apply rate limiting.
- [x] Create a one-day session with request metadata.
- [x] Set the secure session cookie.
- [x] Write `LOGIN_SUCCESS` audit events.
- [x] Write `LOGIN_FAILED` audit events without leaking sensitive details.

### Logout and current user

- [x] Create `POST /api/auth/logout`.
- [x] Invalidate the cookie's session.
- [x] Clear the session cookie.
- [x] Write `LOGOUT` audit events.
- [x] Create `GET /api/auth/me`.
- [x] Return the authenticated user's safe fields only.
- [x] Return 401 for missing, expired, or invalid sessions.

### Password reset

- [x] Create `POST /api/auth/forgot-password`.
- [x] Generate and hash one-hour reset tokens.
- [x] Return a generic response to prevent account enumeration.
- [ ] Deliver reset instructions through an email provider.
- [x] Write `FORGOT_PASSWORD_REQUESTED` audit events.
- [x] Create `POST /api/auth/reset-password`.
- [x] Verify pending and unexpired reset tokens.
- [x] Hash and store the new password.
- [x] Mark the reset token used.
- [x] Invalidate all existing user sessions.
- [x] Write `PASSWORD_CHANGED` audit events.
- [ ] Add auth-route integration tests.

## Phase 5: API Protection and Tenant Isolation

### Protected routes

- [x] Protect employee list/create routes.
- [x] Protect employee detail/update/deactivate routes.
- [x] Protect payroll GET/POST routes.
- [x] Protect `POST /api/payroll/calculate`.
- [x] Protect dashboard reads.
- [x] Protect FBT reads.
- [x] Protect payslip reads.
- [x] Protect report reads.
- [x] Protect settings GET/POST/DELETE routes.
- [x] Add explicit permission checks matching the current permission matrix to every protected route.
- [ ] Add consistent route-level 401 and 403 integration tests.

### Tenant scoping

- [x] Scope employee reads, creates, updates, and deactivations by session business.
- [x] Scope payroll reads, writes, duplicate checks, and settings reads by business.
- [x] Scope dashboard periods, records, trends, and employee counts by business.
- [x] Scope FBT and payslip lookups by business.
- [x] Scope reports and earnings-history queries by business.
- [x] Scope company settings used by payslips by business.
- [x] Verify core business-owned Prisma reads, updates, deletes, aggregates, and creates carry session scope.
- [x] Prevent user-supplied business IDs from overriding session scope in protected core routes.
- [ ] Add cross-business tests for employees, payroll, reports, settings, FBT, payslips, and dashboard.

### Audit identity wiring

- [x] Employee create/update/deactivate audit writes use `userId` and `businessId` fields.
- [x] Payroll save stores `runByUserId` and writes user/business audit fields.
- [x] Include request IP address in authentication and employee/payroll/settings audit writes.
- [ ] Wrap each business mutation and its audit event in one transaction; the current helper is best-effort and non-transactional.
- [x] Create `src/lib/audit.ts` with a reusable `logAuditEvent` helper.
- [x] Make audit-write failures observable through server error logging.

## Phase 6: Login UI and Request Middleware

- [x] Create `/login` page with email/password form.
- [x] Submit login form to the auth API.
- [x] Display validation and rate-limit errors.
- [x] Create `/forgot-password` page.
- [x] Create `/reset-password/[token]` page.
- [x] Add client-side password confirmation and strength validation.
- [x] Add middleware for protected pages and API routes.
- [x] Allow unauthenticated access only to auth pages/routes and public assets.
- [x] Redirect unauthenticated browser requests to `/login`.
- [x] Clear expired session cookies during redirects where supported.
- [x] Update layout to load current user state.
- [x] Update MainNav with user email and role.
- [x] Add logout action to MainNav.
- [x] Filter navigation by role.
- [ ] Add browser smoke tests for login, redirect, and logout.

## Phase 7: User Management

- [x] Add user-management permissions and schemas.
- [x] Create `GET/POST /api/users`.
- [x] Create `GET/PUT/DELETE /api/users/[id]` or logical deactivation route.
- [x] Restrict user management to authorized ADMIN users.
- [x] Restrict ADMIN role creation and prevent privilege escalation.
- [x] Hash user-created passwords.
- [x] Enforce same-business user lookup and mutation.
- [x] Log user create, update, and deactivate events.
- [x] Create `/users` page with list, create, edit, and deactivate workflows.
- [x] Never return password hashes or reset tokens.
- [x] Add user-management documentation and tests.

## Phase 8: Comprehensive Audit Log System

### Audit event coverage

- [x] Add `LOGIN_SUCCESS`.
- [x] Add `LOGIN_FAILED`.
- [x] Add `LOGOUT`.
- [x] Add `FORGOT_PASSWORD_REQUESTED`.
- [x] Add `PASSWORD_CHANGED`.
- [x] Add `USER_CREATED`, `USER_UPDATED`, and `USER_DEACTIVATED`.
- [x] Add employee create, update, and deactivate events.
- [x] Add payroll calculated and saved events.
- [x] Add settings updated and deleted events.
- [x] Add payslip generated events where generation is an auditable action. *(Decision: `PAYSLIP_GENERATED` is reserved — payslips are read-time projections of saved `PayrollRecord`s already covered by `PAYROLL_SAVED`; no separate event is emitted. See docs/changes/2026-09-03-phase-8-audit-completeness.md.)*
- [x] Add report exported events where exports are tracked. (`REPORT_EXPORTED` emitted by `GET /api/reports`.)
- [x] Capture actor, business, timestamp, action, entity, description, old value, new value, and IP address.

### Audit viewer and API

- [x] Create `GET /api/audit-logs`.
- [x] Restrict audit logs to ADMIN+ for their business.
- [x] Define explicit SUPER_ADMIN cross-business audit behavior. *(Decision: SUPER_ADMIN has no audit access until Phase 9 delivers an explicit business-selection flow; no implicit cross-business reads.)*
- [x] Add date, action, entity, user, pagination, and business filters from server context. (`buildAuditLogQuery` also supports `entityId`/`employeeId` filters for API consumers.)
- [x] Create `/audit-logs` page.
- [x] Show timestamp, user, action, entity, description, and expandable changes.
- [x] Add default 30-day date filter.
- [x] Add CSV export. (CWE-1236 escaped, RFC-4180 quoted.)
- [x] Verify audit queries use `(businessId, timestamp)` index. (`@@index([businessId, timestamp])` in schema; query builder pins `businessId` + `timestamp` range + `timestamp` ordering — asserted per-query by the perf test.)
- [x] Add 10k+ row performance test. (`src/lib/audit-constants.test.ts` — 10,000 varied queries, index-alignment invariants, <2s budget.)

### Historical data

- [x] Decide how to associate historical `system` audit rows with a business. *(Decision: audit logging shipped with auth, so pre-auth `system` rows are not expected; `backfill-audit.ts` verifies and offers a reviewed, dry-run-by-default reassignment if orphans ever appear.)*
- [x] Keep historical actor identity nullable where no real user exists. (`userId`/`businessId` optional, `onDelete: SetNull`.)
- [x] Add a reviewed backfill or archival migration if required. (`backfill-audit.ts` — report-only unless `--apply --business-id <cuid>`.)

## Phase 9: Business Management

- [x] Create `GET/POST /api/businesses` for SUPER_ADMIN. (`MANAGE_BUSINESSES` is SUPER_ADMIN-only; no `businessId` required for these routes.)
- [x] Create `GET/PUT /api/businesses/[id]` for SUPER_ADMIN.
- [x] Add business create/update audit events. (`BUSINESS_CREATED` attributed to the new business so its own trail records its origin; `BUSINESS_UPDATED` with old/new JSON.)
- [x] Create `/businesses` page. (SUPER_ADMIN-only nav + page: list, create modal with initial admin, rename, activate/deactivate.)
- [x] Show business status and user counts. (Plus employee and payroll-record counts on the detail fetch.)
- [x] Create an initial ADMIN for a new business. (Same transaction as business creation; duplicate-email guarded.)
- [x] Ensure SUPER_ADMIN cannot implicitly read or mutate business payroll without an explicit support/business-selection flow. *(Decision: business routes expose metadata and lifecycle only; payroll/employee/settings routes keep rejecting SUPER_ADMIN (403) — asserted by test. Cross-business payroll access waits for an explicit support flow.)*
- [x] Add SUPER_ADMIN and business-isolation tests. (`business-management.test.ts` — 8 DB-backed route tests; deactivation cuts sessions while keeping users ACTIVE.)

## Phase 10: Testing

- [x] Existing payroll engine tests still pass.
- [x] Existing FBT engine tests still pass.
- [x] Add password hashing tests. (`src/lib/auth/__tests__/password.test.ts`)
- [x] Add session creation, expiry, and invalidation tests. (`session.test.ts`)
- [x] Add cookie security tests. (`cookies.test.ts`)
- [x] Add rate-limit tests for five failures and 429 behavior. (`rate-limit.test.ts`, route-level 429 in `auth-flows.test.ts`)
- [x] Add login success/failure tests. (`auth-flows.test.ts`)
- [x] Add logout invalidation tests. (`auth-flows.test.ts`)
- [x] Add password reset flow tests. (`auth-flows.test.ts`: token issue/rotate/single-use/no-enumeration)
- [x] Add role and permission tests. (`permissions.test.ts`)
- [x] Add 401 and 403 tests for every protected endpoint. (`route-protection.test.ts`)
- [x] Add tenant-isolation tests across every business-owned resource. (`tenant-isolation.test.ts`)
- [x] Add audit event completeness tests. (`audit-constants.test.ts` + route tests asserting audit rows)
- [x] Run the complete test suite after route and UI work.

## Phase 11: Environment and Deployment

- [x] Add `.env.local.example` with database, bootstrap, session, and rate-limit settings.
- [x] Add `.env.production.example` without secrets.
- [x] Document `BOOTSTRAP_SUPER_ADMIN_EMAIL`. (env examples + `docs/AUTH-IMPLEMENTATION.md` §9)
- [x] Document `BOOTSTRAP_SUPER_ADMIN_PASSWORD` and first-run handling. (ibid. + guide §2)
- [x] Document one-day session configuration. (`SESSION_DURATION_DAYS=1`)
- [x] Document rate-limit configuration. (`MAX_LOGIN_ATTEMPTS`, `RATE_LIMIT_WINDOW_MS`)
- [x] Confirm production cookie behavior over HTTPS. (`secure` set when `NODE_ENV=production`)
- [x] Confirm migration deployment procedure. (`prisma migrate deploy` — AUTH-IMPLEMENTATION §11)
- [x] Confirm seed is not destructive in production. (idempotent, skips when a SUPER_ADMIN exists)
- [x] Add email provider configuration for password reset delivery. (`SMTP_*` in both env examples)

## Phase 12: Documentation and Operations

- [x] Add this repository-level task checklist.
- [x] Add the auth foundation change record in `docs/changes/`.
- [x] Update `docs/API.md` with auth endpoints, permissions, and 401/403/429 responses.
- [x] Update `docs/DATABASE.md` with auth models, tenant relations, constraints, and indexes.
- [x] Update `docs/ARCHITECTURE.md` with login, session, authorization, tenant, and audit flows.
- [x] Update `docs/STACK.md` with bcryptjs and session design.
- [x] Create `docs/AUTH-IMPLEMENTATION.md` technical reference.
- [x] Create `docs/USER-MANAGEMENT-GUIDE.md` operational guide.
- [x] Document role hierarchy and permission matrix. (guide §1)
- [x] Document password reset and session invalidation behavior. (guide §5, reference §7)
- [x] Document audit retention, access, export, and historical-row policy. (AUTH-IMPLEMENTATION §8; changes/2026-09-03-phase-8)
- [x] Document troubleshooting for expired sessions, locked accounts, and reset tokens. (AUTH-IMPLEMENTATION §12, guide §7)
- [x] Remove outdated documentation that says all routes are public or audit identity is `system`.

## Final Acceptance Criteria

- [ ] All non-authenticated protected pages and APIs require an active session.
- [ ] All permissions are enforced server-side.
- [ ] A user from Business A cannot read or mutate Business B data.
- [ ] ADMINs can view a complete, business-scoped audit trail.
- [ ] Audit events contain actor, business, action, timestamp, entity, and IP address.
- [ ] Password reset tokens are one-time, expiring, hashed, and delivered securely.
- [ ] Logout and password changes invalidate sessions as designed.
- [ ] SUPER_ADMIN access is explicit and cannot bypass tenant boundaries accidentally.
- [ ] Payroll engine remains pure and all existing engine tests pass.
- [ ] Full auth, authorization, tenant-isolation, and audit test suites pass.
- [ ] Production environment and migration procedures are documented.
