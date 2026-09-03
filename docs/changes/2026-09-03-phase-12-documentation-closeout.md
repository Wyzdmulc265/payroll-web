# Phase 12 documentation closeout

**Type:** docs
**Date:** 2026-09-03
**Author(s):** AI assistant (Kilo)
**Related issue/PR:** none

---

## 1. Why

Phase 12 of `AUTH-TODO.md` declared all 13 documentation boxes complete,
but several doc files drifted from the implemented code during Phases 6–9.
A reviewer reading `AUTH-IMPLEMENTATION.md`, `API.md`, `ARCHITECTURE.md`,
`STACK.md`, or `USER-MANAGEMENT-GUIDE.md` would hit contradictions with
the actual source. This change corrects those drifts and closes the
Phase 12 checklist honestly.

## 2. What changed

- Removed the stale duplicate §6 "Authentication (Declared, To Be Wired)"
  block from `docs/STACK.md`; renumbered subsequent sections.
- Corrected `docs/AUTH-IMPLEMENTATION.md` §4:
  rate-limit key from "IP + email" to "IP + User-Agent";
  audit action names `LOGIN_SUCCEEDED` → `LOGIN_SUCCESS`,
  `LOGOUT_SUCCEEDED` → `LOGOUT`.
- Corrected `docs/API.md` §5 Settings:
  removed the "does not emit an AuditLog" caveat for DELETE
  (replaced with "Emits `SETTINGS_DELETED` audit event");
  rephrased the misleading `@@unique([key, effectiveFrom])` caveat
  to reflect the actual `(key, businessId)` composite unique.
- Corrected `docs/ARCHITECTURE.md` §2 Directory Layout
  to enumerate the full `src/app/api` route tree
  (auth, users, audit-logs, businesses, fbt, dashboard).
- Corrected `docs/ARCHITECTURE.md` §7 Audit Trail:
  replaced "ipAddress is declared but not yet populated"
  with confirmation that `ipAddress` and `userAgent` are populated
  by `src/lib/audit.ts`.
- Corrected `docs/USER-MANAGEMENT-GUIDE.md` §4:
  password rule now matches the actual Zod schema
  (min 8, one uppercase, one number — no lowercase requirement).
- Verified `docs/DATABASE.md` §7 migrations table already matches
  `prisma/migrations/` on disk; no rows added.
- Flipped `AUTH-TODO.md` Phase 3 rate-limiter checkbox to `[x]`
  with justification (already DB-backed via `RateLimit` table).
- Updated `AUTH-TODO.md` Final Acceptance Criteria:
  9 items → `[x]`, 1 item → `[x] (SMTP-dependent)`,
  1 item → `[ ] (blocked by Neon transaction-pooler env)`.

## 3. How it works

Each doc edit is a targeted string replacement:

- `docs/STACK.md`: removed lines 200–212 (§6 block) and renumbered
  §7→§6, §8→§7, §9→§8, §10→§9.
- `docs/AUTH-IMPLEMENTATION.md:37–44`: three token replacements in
  the login/logout flow paragraph.
- `docs/API.md:455–469`: replaced the stale upsert caveat and the
  stale DELETE audit caveat with accurate descriptions.
- `docs/ARCHITECTURE.md:64–101`: replaced the 8-route tree with a
  full 19-route tree generated from the actual `src/app/api`
  directory listing.
- `docs/ARCHITECTURE.md:253–254`: replaced the "not yet populated"
  sentence with a positive confirmation.
- `docs/USER-MANAGEMENT-GUIDE.md:64–66`: replaced "upper, lower, and
  digit classes" with the three actual rules from
  `src/lib/auth/schemas.ts`.
- `AUTH-TODO.md:85`: flipped Phase 3 checkbox with parenthetical
  justification.
- `AUTH-TODO.md:287–299`: replaced the 11 bare `[ ]` criteria with
  the dispositioned list.

## 4. What got better

A reviewer can now read any of the six affected docs without hitting a
contradiction with the source. The Phase 12 checklist accurately
reflects implementation reality — nine criteria confirmed met, one
flagged as SMTP-dependent, one honestly recorded as environment-blocked.

## 5. Risks and trade-offs

- Doc-only change; no runtime behaviour risk.
- The 🟡 SMTP caveat is called out so operators don't ship password
  reset without configuring an email provider in production.
- The ❌ Neon transaction-pooler environment gap is noted as a
  separate ops ticket; Phase 12 does not attempt to fix it.

## 6. Test plan

Verified by running the grep commands from the plan's validation
section:

```
rg -n "next-auth" docs/STACK.md
# → 0 results outside the "(pre-installed, superseded)" line in §5.

rg -n "LOGIN_SUCCEEDED|LOGOUT_SUCCEEDED|IP \\+ email" docs/AUTH-IMPLEMENTATION.md
# → 0 results.

rg -n "does not emit an AuditLog" docs/API.md
# → 0 results.

rg -n "ipAddress.*not yet populated" docs/ARCHITECTURE.md
# → 0 results.

rg -n "\\[ \\]" AUTH-TODO.md
# → shows only the 🟡/❌ lines plus Phase 1 carryovers.
```

Also confirmed `npm run lint` and `tsc --noEmit` still pass
(docs-only change, but verified for safety).

## 7. Follow-ups

- Configure SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`) in production for full password-reset delivery.
- Address the Neon transaction-pooler environment gap as a separate
  ops ticket so the full DB-backed test suite can run in CI.
- Consider removing `next-auth` from `dependencies` once the
  custom session system is stable (tracked in `IMPROVEMENTS.md`).
  <em>Update: `next-auth` has been removed in
  `2026-09-03-dependency-cleanup-and-fixes.md`.</em>
