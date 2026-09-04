# Bug: Audit-logs page crashes with `log.timestamp.toISOString is not a function`

**Severity:** high
**Date discovered:** 2026-09-04
**Date fixed:** 2026-09-04
**Reporter:** user (runtime TypeError on `/audit-logs`)
**Related issue/PR:** none

---

## 1. Symptom

Opening `/audit-logs` crashed the page with:

```
Runtime TypeError: log.timestamp.toISOString is not a function
    at AuditLogsPage (src/app/audit-logs/page.tsx:288:54)
```

The table never rendered; every filter state hit the same crash.

## 2. Reproduction

1. Log in as ADMIN or SUPER_ADMIN.
2. Navigate to `/audit-logs` (default last-30-days filter).
3. Page throws during render of the first table row, every time — no special
   data required.

## 3. Impact

- **High** for auditability: the audit-log viewer (added in
  `docs/changes/2026-09-03-add-audit-log-viewer.md`) was completely unusable
  for all roles. No data loss — the API returned rows correctly; only the
  client render crashed.

## 4. Root cause

`AuditLogDto.timestamp` was typed `Date` (`src/lib/audit-constants.ts:111`),
and the row renderer trusted that type:

```tsx
// src/app/audit-logs/page.tsx:288 (before)
{formatTimestamp(log.timestamp.toISOString())}
```

But the DTO crosses the JSON transport boundary (`NextResponse.json`), which
serializes `Date` to an ISO string. At runtime `log.timestamp` is a `string`,
which has no `.toISOString()`. TypeScript could not catch it because the
shared DTO type described the server-side shape, not the wire shape. (The CSV
exporter on the same page, line 145, already used the safe
`new Date(log.timestamp)` pattern — only the table cell was wrong.)

## 5. Fix

Made the DTO type honest about the wire format and serialized explicitly at
the API edge, so the lie cannot recur:

- `src/lib/audit-constants.ts` — `AuditLogDto.timestamp: Date` →
  `timestamp: string` (with a comment noting it is the ISO string over JSON).
- `src/app/api/audit-logs/route.ts:126` — mapper now emits
  `timestamp: r.timestamp.toISOString()` (server side, where it genuinely is
  a `Date`).
- `src/app/audit-logs/page.tsx:288` — renders
  `formatTimestamp(log.timestamp)` directly.

This matches the existing convention in sibling routes (`fbt/route.ts:76`,
`payroll/route.ts:229` already serialize dates explicitly at the edge).

## 6. Verification

- `npx tsc --noEmit` — clean (the new `string` type flows through the page's
  `AuditLogResponse`/`useState<AuditLogDto[]>` without further changes).
- `npx eslint` on the three touched files — clean.
- Grepped `src/app` for other client-side `.toISOString()` calls on fetched
  data: all remaining hits are on locally constructed `new Date()` values or
  server-side Prisma fields — this page was the only occurrence.
- Manual page-load verification against the dev server was not run here; the
  render path is now type-guaranteed (`formatTimestamp(iso: string)` receives
  a `string`), and the previously-crashing expression no longer exists.

## 7. Prevention

- DTOs shared between route handlers and client components must be typed by
  their **wire shape** (post-`JSON.stringify`), not the Prisma shape.
  `AuditLogDto.timestamp: string` now enforces this at compile time: any
  future `.toISOString()` on it is a type error, not a runtime crash.
- Follow-up: audit remaining shared DTOs for the same `Date`-over-JSON
  mismatch (e.g. any table rendering `createdAt`/`runDate` from fetched
  payloads should be checked for direct `Date`-method calls).
