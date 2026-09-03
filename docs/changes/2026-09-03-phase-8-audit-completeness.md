# Phase 8: Complete the Comprehensive Audit Log System

**Type:** feature / policy decisions
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `AUTH-TODO.md` — Phase 8 (all remaining items)

---

## 1. Why

Phase 8 was mostly implemented (event registry, `logAuditEvent` write path
wired into every auth/user/employee/payroll/settings mutation,
`GET /api/audit-logs`, `/audit-logs` viewer). Four items remained:

1. `REPORT_EXPORTED` was declared but **never emitted** — report exports
   were invisible in the audit trail.
2. The **10k+ row performance test** did not exist.
3. The **historical `system` rows** policy was undecided.
4. The `(businessId, timestamp)` index usage and `PAYSLIP_GENERATED`
   applicability needed explicit verification/decisions.

## 2. What changed

- **`REPORT_EXPORTED` emitted** (`src/app/api/reports/route.ts`): after a
  successful report generation, `logAuditEvent` records actor, business,
  IP, and `{ type, period, department, rowCount }`. This is the single
  choke point — the browser's CSV/Excel export buttons consume this same
  response, so every export is captured exactly once. `logAuditEvent`
  swallows write errors on the non-transaction path, so audit failures
  never break a report response.
- **Tests** (`src/lib/audit-constants.test.ts`, new):
  - Registry completeness — every Phase 8 action is declared and unique.
  - `buildAuditLogQuery` unit tests — businessId pinning, timestamp
    range, equality filters (`{ equals }` form), OR-contains text search,
    pagination clamping, newest-first ordering.
  - **10k-row performance test** — builds 10,000 varied filter
    combinations and, for each, asserts index alignment with
    `@@index([businessId, timestamp])` (businessId equality + timestamp
    gte/lte + `timestamp` ordering) under a 2-second budget.
- **Historical-rows backfill** (`backfill-audit.ts`, new, root — matches
  the existing `backfill.ts` convention): prints a report of total /
  no-business / no-user audit rows with the 20 oldest orphans. **Dry-run
  by default**; reassignment only with `--apply --business-id <cuid>`,
  and it refuses to guess a business.

## 3. Decisions (documented policy)

| Item | Decision |
| --- | --- |
| `PAYSLIP_GENERATED` | **Reserved, not emitted.** Payslips are read-time projections of saved `PayrollRecord`s; the write is already covered by `PAYROLL_SAVED`. Emitting a per-view event would flood the trail without adding accountability. Revisit only if payslip *delivery* (email/PDF share) becomes an explicit action. |
| SUPER_ADMIN cross-business audit | **No access today.** `GET /api/audit-logs` pins `businessId` to the session business; SUPER_ADMIN users without a business get 401 like everyone else. Cross-business audit review arrives in Phase 9 via an explicit business-selection flow — never implicit. |
| Historical `system` rows | Audit logging shipped together with authentication, so pre-auth rows are **not expected to exist**. `backfill-audit.ts` verifies this in production. If orphan rows appear (manual imports), they are re-assigned only through the reviewed `--apply` flow. Actor identity stays nullable by design (`userId`/`businessId` optional, `onDelete: SetNull`), so rows survive user deletion while remaining business-scoped. |
| Index usage | Verified: schema has `@@index([businessId, timestamp])`; the query builder always pins `businessId`, narrows `timestamp` when dates are given, and sorts only on `timestamp`/`action` so the planner can satisfy filter + order from one index scan. The perf test asserts these invariants per query. |

## 4. Files touched

| File | Change |
| --- | --- |
| `src/app/api/reports/route.ts` | Emit `REPORT_EXPORTED` on successful generation |
| `src/lib/audit-constants.test.ts` | New — registry, query-builder, and 10k perf tests |
| `backfill-audit.ts` | New — reviewed historical-row backfill (dry-run default) |
| `AUTH-TODO.md` | Phase 8 items checked with decision notes |

## 5. Testing

- `npx vitest run` — **113 tests / 10 files pass**, including the 9 new
  audit tests (perf test: 10k builds ≈1.3s, well under budget).
- `npx tsc --noEmit` — no errors in touched files.
- `backfill-audit.ts` is intentionally not run against production here;
  its default mode is a safe read-only report.

## 6. Limitations / follow-ups

- Cross-business audit review for SUPER_ADMIN is Phase 9 scope.
- `AUDIT_LOG_ROUTE` retention/archival windows (e.g. purge after N years)
  are an operations decision deferred to Phase 12 documentation.
