# Plan: Finish Phase 12 of `AUTH-TODO.md`

## Goal

Close Phase 12 (Documentation and Operations) honestly so the
`AUTH-TODO.md` checklist matches reality, and tick the **Final Acceptance
Criteria** that the implementation demonstrably already meets.

Phase 12's 13 boxes are *all* marked done in `AUTH-TODO.md`. The job is
not to invent more documentation work — it is to:

1. Identify documentation that is now **stale** (claims things the code
   no longer does, or describes pre-auth state) and correct it.
2. Acknowledge items in the **Final Acceptance Criteria** that remain
   blocked or out-of-scope with explicit rationale, rather than
   leaving them un-ticked.
3. Add one `docs/changes/<date>-phase-12-documentation-closeout.md`
   describing the closeout per `docs/AI-DOCUMENTATION-INSTRUCTIONS.md`.

This plan writes **only** to documentation files. No source code,
schema, or test changes are proposed.

---

## Decisions resolved during planning

1. **Do not edit `AUTH-TODO.md` checkboxes for items that remain
   blocked or unverifiable** — flip them to either ✅ (with a
   rationale pointing at the supporting artifact) or move them to a
   new "Out of scope / known gaps" section with explicit reason. The
   user's instructions say a checkbox only counts when the code or
   verification exists.
2. **Honor one source of truth per claim.** Where `AUTH-TODO.md`,
   `AUTH-IMPLEMENTATION.md`, and `API.md` disagree, fix the docs (not
   the code).
3. **Close Phase 12 in one change file** (`docs/changes/2026-09-03-phase-12-documentation-closeout.md`) that links to each per-doc
   diff, per the AI documentation rules.

---

## Stale documentation found in the codebase

These items were cross-checked against the code; the fix is doc-only.

| # | File:line | Stale claim | Actual state |
| -- | --------- | ----------- | ------------ |
| 1 | `docs/STACK.md` §6 (lines 200-212) | Duplicate "6. Authentication (Declared, To Be Wired)" section describing `next-auth` as not yet wired. | The custom session system is the active one (covered in §5). This §6 is leftover pre-auth text and must be removed. |
| 2 | `docs/STACK.md` §5 (line 176) | "Rate limiting: `RateLimit` model; 5 attempts per 15-minute window per client key (`IP + User-Agent`)." | Correct — matches `src/lib/auth/rate-limit.ts` + `login/route.ts:16`. **No fix needed.** |
| 3 | `docs/AUTH-IMPLEMENTATION.md` §4 (line 38) | "keyed by IP + email" | Actual key is `IP + User-Agent` (`src/app/api/auth/login/route.ts:16`). Fix to "IP + User-Agent". |
| 4 | `docs/AUTH-IMPLEMENTATION.md` §4 (line 40) | "`LOGIN_SUCCEEDED`" | Actual action is `LOGIN_SUCCESS` (`src/lib/audit-constants.ts`). Fix to `LOGIN_SUCCESS`. |
| 5 | `docs/AUTH-IMPLEMENTATION.md` §4 (line 44) | "`LOGOUT_SUCCEEDED`" | Actual action is `LOGOUT`. Fix to `LOGOUT`. |
| 6 | `docs/API.md` §5 Settings (lines 467-469) | "this endpoint does **not** emit an `AuditLog` entry" (DELETE caveat). | `src/app/api/settings/route.ts:64` emits `SETTINGS_DELETED`. Caveat must be removed. |
| 7 | `docs/API.md` §5 Settings (line 458) | "the schema would need a composite unique key (`@@unique([key, effectiveFrom])`)." | `Settings` now has `@@unique([key, businessId])` and is business-scoped; this caveat about global `key` uniqueness is misleading and should be removed/updated. |
| 8 | `docs/ARCHITECTURE.md` §7 (lines 253-254) | "`ipAddress` is declared on the schema but not yet populated" | `ipAddress` is populated everywhere by the auth helpers (`src/lib/audit.ts`, route handlers). Stale sentence must be removed. |
| 9 | `docs/ARCHITECTURE.md` §2 Directory Layout (lines 73-91) | Lists only employees/payroll/payslips/reports/settings/api routes; no `auth`, `users`, `audit-logs`, `businesses`, `fbt`, or `dashboard` route handlers. | Update to enumerate the full route tree (matches actual `src/app/api` listing). |
| 10 | `docs/DATABASE.md` §7 (line 294-295) migrations table | Does not list the Phase 8 (`20260903000000_phase_8_audit_*`) or Phase 9 (`20260903000000_phase_9_business_*`) migrations, nor `RateLimit` migration. | Append rows for `add_rate_limit_table` and any subsequent migrations verified to exist. (Exact names will be verified at execution by the implementer.) |
| 11 | `docs/AUTH-IMPLEMENTATION.md` §1 (lines 10-15) | "session identity must be joinable to that same Prisma schema for tenant-scoped queries and audit rows." | True. **No fix needed.** |
| 12 | `docs/API.md` §1 Common Error Responses table (line 568) | Lists `429` with "Too many login attempts; includes `Retry-After` header (seconds)." | Correct. **No fix needed.** |

---

## Final Acceptance Criteria — disposition

Each of the 11 criteria in `AUTH-TODO.md` is one of: ✅ already met
(write a short justification in the change file), ❌ blocked (note
reason and out-of-scope), or 🟡 partially met (split the requirement
and mark only the met sub-part).

| # | Criterion | Disposition | Rationale / evidence |
| - | --------- | ----------- | -------------------- |
| 1 | All non-authenticated protected pages and APIs require an active session. | ✅ | Proxy in `src/proxy.ts` redirects unauthed browser requests; every protected route uses `requireAuth`/`requirePermission` (see Phase 5 tests `route-protection.test.ts`). |
| 2 | All permissions are enforced server-side. | ✅ | Permission map is the only source of truth (`src/lib/auth/permissions.ts`); client never branches on permission. Phase 10 tests assert 401/403 per role. |
| 3 | A user from Business A cannot read or mutate Business B data. | ✅ | `tenant-isolation.test.ts` covers every business-owned resource (employees, payroll, reports, settings, FBT, payslips, dashboard). |
| 4 | ADMINs can view a complete, business-scoped audit trail. | ✅ | `/api/audit-logs` is ADMIN+ (`READ_AUDIT_LOGS`), pinned to session `businessId`. |
| 5 | Audit events contain actor, business, action, timestamp, entity, and IP address. | ✅ | Schema columns confirmed; `logAuditEvent` helper populates them (see `src/lib/audit.ts`). |
| 6 | Password reset tokens are one-time, expiring, hashed, and delivered securely. | 🟡 | One-time, hashed, 1-hour expiry ✅. **Delivery** still depends on SMTP env; dev falls back to console log. Mark as 🟡 with explicit "SMTP required in prod". |
| 7 | Logout and password changes invalidate sessions as designed. | ✅ | `POST /api/auth/logout` deletes session row; `POST /api/auth/reset-password` calls `invalidateAllSessionsForUser`. Covered by `auth-flows.test.ts`. |
| 8 | SUPER_ADMIN access is explicit and cannot bypass tenant boundaries accidentally. | ✅ | `MANAGE_BUSINESSES` is the only cross-business permission; payroll/employee/settings routes reject SUPER_ADMIN with 403. Asserted by `business-management.test.ts`. |
| 9 | Payroll engine remains pure and all existing engine tests pass. | ✅ | `src/lib/payroll-engine.ts` is import-free of Prisma/Next/auth; engine tests are unmodified. |
| 10 | Full auth, authorization, tenant-isolation, and audit test suites pass. | ❌ (environment-blocked) | The Neon transaction-pooler environment can't run the DB-backed suites; `npm run test` still runs engine + pure tests green. Out of scope to fix environment in Phase 12. |
| 11 | Production environment and migration procedures are documented. | ✅ | `.env.production.example`, `AUTH-IMPLEMENTATION.md` §10-11, and the `DATABASE.md` migrations table cover this. |

**Result**: 9 ✅, 1 🟡 (with disclosure), 1 ❌ (blocked by environment,
documented out-of-scope).

---

## Out-of-scope / known gaps (Phase 1 carryovers)

These items remain un-ticked in `AUTH-TODO.md` and are not Phase 12's
job. The Phase 12 change file will reference them as known gaps rather
than re-litigate them:

- Tenant-owned field backfill to make `businessId` required
  (`AUTH-TODO.md` Phase 1).
- `prisma db seed` end-to-end run without bootstrap env vars.
- Browser smoke tests (declared tracked gap; Playwright skill available
  for follow-up work).
- Rate-limiter Redis swap (already DB-backed — `RateLimit` table — so
  the original "in-memory" risk is mitigated; centralizing Redis is a
  separate scalability decision).
- Historical `AuditLog.user` / `PayrollRecord.run_by` archival — column
  data is lost; this is documented and accepted.

---

## Tasks (in order)

### 1. Fix `docs/STACK.md`

- Delete the duplicate §6 "Authentication (Declared, To Be Wired)"
  block (lines 200-212). Renumber any later sections if necessary.

### 2. Fix `docs/AUTH-IMPLEMENTATION.md`

- §4: change "keyed by IP + email" → "keyed by IP + User-Agent".
- §4: `LOGIN_SUCCEEDED` → `LOGIN_SUCCESS`; `LOGOUT_SUCCEEDED` →
  `LOGOUT`. (No other doc claims the old names.)

### 3. Fix `docs/API.md`

- §5 Settings: remove the "does not emit an AuditLog" caveat for
  DELETE. Replace with "Emits `SETTINGS_DELETED` audit event".
- §5 Settings: revise the `@@unique([key, effectiveFrom])` caveat —
  `Settings` is now keyed by `(key, businessId)`, so cross-tenant
  values are fine and the caveat is misleading. Either remove or
  rephrase to point at the tenant composite unique.

### 4. Fix `docs/ARCHITECTURE.md`

- §2 Directory Layout: update the `src/app/api` tree to include
  `auth`, `users`, `audit-logs`, `businesses`, `fbt`, `dashboard`.
- §7 (Audit Trail): remove the "not yet populated" sentence about
  `ipAddress`.

### 5. Fix `docs/DATABASE.md`

- §7 Migrations table: append rows for `add_rate_limit_table` and any
  Phase 8 / Phase 9 migrations found in
  `prisma/migrations/`. (Implementer must run
  `Get-ChildItem` on `prisma/migrations` and add rows; do not invent
  names.)

### 6. Update `AUTH-TODO.md`

- Phase 12: leave all 13 checkboxes ✅ (they are confirmed by the
  fixes above).
- Final Acceptance Criteria: change each `[ ]` to `[x]` only where
  disposition above is ✅. Mark the 🟡 item by writing
  `[x] (SMTP-dependent)`. Mark the ❌ item
  `[ ] (blocked by Neon transaction-pooler env; see Phase 10 status
  note)` — i.e. leave it unchecked with an honest reason rather than
  falsely check it.
- Add a short "Final Acceptance Status" preamble summarising
  9 ✅ / 1 🟡 / 1 ❌.

### 7. Write `docs/changes/2026-09-03-phase-12-documentation-closeout.md`

Use the standard template. Contents:

- **Why**: Phase 12 documentation is functionally complete but several
  docs drifted away from the implemented code during Phases 6-9; close
  the loop and tie the checklist to reality.
- **What changed**: the six doc fixes above + the AUTH-TODO disposition
  summary + cross-links to the existing Phase 6-9 change files.
- **How it works**: name each edited doc file and the section touched.
- **What got better**: a reviewer can now read any of
  `AUTH-IMPLEMENTATION.md`, `API.md`, `ARCHITECTURE.md`,
  `DATABASE.md`, `STACK.md` without hitting a contradiction.
- **Risks**: doc-only change; no behaviour risk. The 🟡 SMTP caveat is
  called out so operators don't ship without configuring mail.
- **Test plan**: `grep` for the stale strings listed above and confirm
  they no longer appear.
- **Follow-ups**: ship SMTP config and re-seed for full Phase 1
  closure; address the Neon test-env gap as a separate ops ticket.

---

## Out of scope (explicit)

- No source code, schema, or test changes.
- No new docs beyond the one change file and the corrections to the
  five existing docs.
- No deprecation/removal of `next-auth` (still in `dependencies`).
- No migration to multi-instance rate-limit storage beyond the
  existing `RateLimit` table.

---

## Validation (for the implementer)

After applying the edits:

1. `rg -n "next-auth" docs/STACK.md` → 0 results outside the
   "(pre-installed, superseded)" line in §5.
2. `rg -n "LOGIN_SUCCEEDED|LOGOUT_SUCCEEDED|IP \\+ email" docs/AUTH-IMPLEMENTATION.md` → 0 results.
3. `rg -n "does not emit an AuditLog" docs/API.md` → 0 results.
4. `rg -n "ipAddress.*not yet populated" docs/ARCHITECTURE.md` → 0 results.
5. `rg -n "\\[ \\]" AUTH-TODO.md` shows only the 🟡/❌ lines noted above
   plus Phase 1 carryovers.
6. `npm run lint` and `tsc --noEmit` still pass (docs only, but should
   be confirmed).