# Add `POST /api/settings/batch` endpoint for atomic saves

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#3`

## 1. Why

The settings page issued one `POST /api/settings` per field in parallel.
A network blip mid-save left the `Settings` table half-updated, with no
rollback. For a payroll system, that means statutory rates and payslips
can drift out of sync, silently.

## 2. What changed

- A new `POST /api/settings/batch` endpoint accepts an array of upserts
  and writes them in a single Prisma transaction.
- The settings page now issues a single batch request on save instead
  of N parallel requests.
- A single `AuditLog` row is written per batch with the full payload,
  replacing the previous N individual entries.

## 3. How it works

- New route: `src/app/api/settings/batch/route.ts`.
- Schema: `z.array(settingSchema).min(1)`.
- The handler wraps `prisma.$transaction(validatedData.map(...))` and
  emits a single `AuditLog`.

```ts
// src/app/api/settings/batch/route.ts
const results = await prisma.$transaction(
  validatedData.map((row) =>
    prisma.settings.upsert({
      where: { key_businessId: { key: row.key, businessId } },
      update: { ... },
      create: { ... },
    })
  )
);
```

The settings page (`src/app/settings/page.tsx`) replaces its
`Promise.all(rows.map(post))` with a single `post('/api/settings/batch', rows)`.

## 4. What got better

| Before | After |
|--------|-------|
| N round-trips, each its own transaction. | 1 round-trip, 1 transaction. |
| Half-save possible on network blip. | All-or-nothing. |
| N `AuditLog` rows per save. | 1 `AuditLog` row with the full diff. |
| No error feedback on partial failure. | Callers get a single success/failure. |

Ties to the qualities in `docs/README.md#why-this-app-is-special`:

- **Auditable** — one log row per *intent*, not per *effect*.
- **Statutorily correct** — the system can no longer be in a half-rate
  state mid-save.

## 5. Risks and trade-offs

- The new endpoint is additive. `POST /api/settings` remains for
  backward compatibility and for one-off scripts.
- A follow-up should deprecate `POST /api/settings` once all clients
  migrate (tracked in `docs/IMPROVEMENTS.md#3` follow-ups).
- The single `AuditLog` row's `newValue` is JSON-stringified text,
  mirroring the existing pattern. A future migration should switch to
  `Json`.

## 6. Test plan

- **Manual**: open `/settings`, change 5 fields, save. Refresh the
  page; all 5 changes are visible. Throttle the network to "Slow 3G"
  mid-save; verify no partial state.
- **Unit**: `__tests__/api/settings.batch.test.ts` covers the happy
  path, an empty array (400), and a transaction rollback scenario.

## 7. Follow-ups

- Migrate all settings-page callers to use the new endpoint (done in
  this PR).
- Deprecate `POST /api/settings` once all clients migrate.
- Add an integration test that exercises the full settings-save flow
  through the UI.
