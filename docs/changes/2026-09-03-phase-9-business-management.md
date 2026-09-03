# Phase 9: Business Management (SUPER_ADMIN)

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `AUTH-TODO.md` Phase 9; `docs/AUTH-AUDIT.md` business management section

---

## 1. Why

Phase 9 was the last unchecked phase of the auth/audit roadmap: SUPER_ADMIN
had a role in the enum but no capability — there was no way to onboard a new
business (tenant) from inside the app, list tenants, rename them, or manage
the business lifecycle. Creating a business required direct database access.

## 2. What changed

### API
- `src/app/api/businesses/route.ts` — `GET` (list all businesses newest-first
  with `_count` of users/employees/payrollRecords) and `POST` (create).
- `src/app/api/businesses/[id]/route.ts` — `GET` (single with counts),
  `PUT` (rename **and lifecycle**: setting `status: "INACTIVE"` deactivates the business and cuts every active session of its users in the same transaction — users themselves stay `ACTIVE` so re-activation restores access without per-user churn), `DELETE` (refuse unless the business has no users,
  employees, or payroll records — returns 409 otherwise; deletion cascades
  are treated as a data-loss hazard).
- All routes: `Permission.MANAGE_BUSINESSES` (SUPER_ADMIN-only) via the
  standard `requirePermission` guard.
- `src/lib/auth/schemas.ts` — `createBusinessSchema` (name required,
  address/phone/email optional) and `updateBusinessSchema` (all optional,
  min 1 field).
- Initial ADMIN onboarding: `POST` accepts an optional `initialAdmin` (email + password); the ADMIN user is created — duplicate-email guarded (400) — inside the same transaction as the business, with a `USER_CREATED` audit row attributed to the new business so its own trail records its origin.
- Audit: `BUSINESS_CREATED` / `BUSINESS_UPDATED` events written **inside
  the same Prisma transaction** as the mutation, with 15s
  `maxWait`/`timeout` (Neon cold-start tolerance; the 5s default produced
  P2028 commit timeouts on the slow shared dev DB).

### Registry
- `src/lib/audit-constants.ts` — added `BUSINESS_CREATED`,
  `BUSINESS_UPDATED`, `BUSINESS_DEACTIVATED` (reserved for future lifecycle
  work; not yet emitted) to the audit registry with `Business` entity type.

### UI
- `src/app/businesses/page.tsx` — SUPER_ADMIN-only page: business table
  with usage counts, create modal, rename action. No delete affordance
  (safety rule #1 below).
- `src/components/MainNav.tsx` — Businesses nav entry,
  `permission: Permission.MANAGE_BUSINESSES`, no `requiresBusiness` flag
  (SUPER_ADMIN may operate without belonging to one).

### Security invariants (asserted by tests)
1. **No implicit cross-business data access.** MANAGE_BUSINESSES grants
   metadata/lifecycle operations only. SUPER_ADMIN still cannot read any
   business's employees, payroll, or payslip data; every data route keeps
   pinning `businessId` to the session.
2. **No tenant deletion while populated.**

## 3. How it works

```text
SUPER_ADMIN → GET /api/businesses (requirePermission MANAGE_BUSINESSES)
            → prisma.business.findMany({ include: { _count: … } })

POST /api/businesses
  → validate via createBusinessSchema (Zod)
  → prisma.$transaction([
      prisma.business.create(…),
      prisma.auditLog.create({ action: BUSINESS_CREATED, … })
    ], { maxWait: 15000, timeout: 15000 })
  → 201 { data: business }
```

## 4. Files touched

| File | Change |
| --- | --- |
| `src/app/api/businesses/route.ts` | New — list/create |
| `src/app/api/businesses/[id]/route.ts` | New — get/rename/delete (guarded) |
| `src/lib/auth/schemas.ts` | Business Zod schemas |
| `src/lib/audit-constants.ts` | Business audit actions |
| `src/app/businesses/page.tsx` | New admin page |
| `src/components/MainNav.tsx` | Businesses nav entry |
| `src/lib/auth/__tests__/business-management.test.ts` | New DB-backed route tests |
| `docs/API.md`, `docs/UI.md` | §8 Business Management + §3.8 page docs |
| `AUTH-TODO.md` | Phase 9 checkboxes ticked |

## 5. Testing

`src/lib/auth/__tests__/business-management.test.ts` (DB-backed, follows
the `tenant-isolation.test.ts` pattern): SUPER_ADMIN can list/create/rename
with audit rows written; ADMIN is 403 on every businesses route; rename
writes `BUSINESS_UPDATED` with `oldValue`/`newValue` payloads; delete of a
populated business returns 409.

Note: tests hit the shared Neon dev database; two initial failures were
P2028 transaction-commit timeouts (5s default vs 5–13s cold-start latency)
and one wrong assertion (`previousData` vs the actual `oldValue`/`newValue`
columns) — both fixed. One pre-existing flake was observed in
`tenant-isolation.test.ts` when two vitest runs raced on the shared DB;
passes cleanly in isolation.

Full suite: 113+ tests green; `tsc --noEmit` clean on all touched files.

## 6. Limitations / follow-ups

- Lifecycle emits `BUSINESS_UPDATED` (with a status-transition description)
  rather than a distinct `BUSINESS_DEACTIVATED` action; introducing a dedicated
  action later is a naming-only refactor.
- Deactivation cuts sessions server-side; SUPER_ADMIN should communicate
  the outage to the tenant out-of-band (no notification email yet).
- No cross-business audit viewer for SUPER_ADMIN (Phase 8 decision stands:
  granted explicitly, never implicitly, when a business-selection flow ships).
- Email uniqueness of business contact fields is not enforced (informational
  fields only).

