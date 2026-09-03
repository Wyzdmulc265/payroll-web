# Refresh auth documentation

**Type:** docs
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

`docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/API.md`, and
`docs/UI.md` still described `next-auth` as the planned auth system,
`"system"` as the audit identity, and missing auth migrations. The
actual auth foundation is now complete and these docs were misleading.

## 2. What changed

- `docs/ARCHITECTURE.md` — replaced §6 "Auth (Current State and
  Roadmap)" with the real custom session flow; updated the layered
  diagram to include `src/lib/auth/` and `src/lib/audit.ts`.
- `docs/STACK.md` — replaced §6 "Authentication (Declared, To Be
  Wired)" with a description of the active custom session system and
  the superseded `next-auth` dep; expanded the `crypto` section to
  cover the session token lifecycle.
- `docs/API.md` — added `401`/`403`/`429` to Common Error Responses;
  fixed `AuditLog` action from `'CREATE'` to `'EMPLOYEE_CREATED'` and
  `user: 'system'` to the resolved email.
- `docs/DATABASE.md` — added auth models to §1.1; documented employee
  ID uniqueness (per-business), `businessId` nullability rationale,
  and the dropped legacy columns.
- `docs/UI.md` — updated the persistent shell section to reference
  `UserProvider` and the auth-page hiding behavior in `MainNav`.
- `docs/changes/2026-09-02-phase-6-login-ui-and-proxy.md` — updated
  Follow-ups to link to the new Playwright smoke tests.

## 3. How it works

Each doc was edited in place to match the actual code. No code changes
were made in this commit.

## 4. What got better

- Docs now match the running system.
- Future contributors won't be misled by stale next-auth references.

## 5. Risks and trade-offs

- None — documentation-only change.

## 6. Test plan

- `npx tsc --noEmit` passes for docs (Markdown files are not type-checked).
- Manual review of each doc section for accuracy.

## 7. Follow-ups

- Remove `next-auth` from `dependencies` once no references remain
  (tracked in `IMPROVEMENTS.md`).
  <em>Update: `next-auth` has been removed in `2026-09-03-dependency-cleanup-and-fixes.md`.</em>
- Update `README.md` auth section to match.
