# Example: Add `POST /api/settings/batch` for atomic settings save

> This is a **template** file showing the exact shape every
> `docs/changes/<date>-<slug>.md` should take. It is not (yet) a
> record of a real change — it is the worked example included
> inline in `docs/AI-DOCUMENTATION-INSTRUCTIONS.md` so the format
> is easy to copy.
>
> When you write a real change, replace this preamble with the
> one-paragraph TL;DR and follow the structure below.

**Type:** feature
**Date:** 2026-09-15
**Author(s):** AI assistant
**Related issue/PR:** #142
**Addresses:** `docs/IMPROVEMENTS.md#3`

---

## 1. Why

The settings page issues one `POST /api/settings` per field in
parallel. A network blip mid-save leaves the `Settings` table
half-updated, with no rollback. For a payroll system, that means
statutory rates and payslips can drift out of sync, silently.

## 2. What changed

- A new `POST /api/settings/batch` endpoint accepts an array of
  upserts and writes them in a single Prisma transaction.
- The settings page now issues a single batch request on save
  instead of N parallel requests.
- An `AuditLog` row is written **once per batch** with the full
  before/after map, replacing the previous N individual entries.

## 3. How it works

- New route: `src/app/api/settings/batch/route.ts`.
- Body schema: `z.array(settingSchema).min(1)`.
- The handler wraps `prisma.$transaction(rows.map(...))` in a
  try/catch and emits a single `AuditLog`.

```ts
// src/app/api/settings/batch/route.ts
const rows = z.array(settingSchema).min(1).parse(await req.json());

await prisma.$transaction(
  rows.map(r => prisma.settings.upsert({
    where: { key: r.key },
    update: { value: r.value, ... },
    create: { key: r.key, value: r.value, ... },
  })),
);

await prisma.auditLog.create({
  data: {
    user: 'system',
    action: 'BATCH_UPDATE',
    entityType: 'Settings',
    description: `Updated ${rows.length} setting(s) atomically`,
    newValue: JSON.stringify(rows),
  },
});
```

The settings page (`src/app/settings/page.tsx`) replaces its
`Promise.all(rows.map(post))` with a single `post('/api/settings/batch', rows)`.

## 4. What got better

| Before | After |
| --- | --- |
| N round-trips, each its own transaction. | 1 round-trip, 1 transaction. |
| Half-save possible on network blip. | All-or-nothing. |
| N `AuditLog` rows per save. | 1 `AuditLog` row with the full diff. |
| Each request re-validates the Zod schema independently. | Schema validated once for the batch. |

Ties to the qualities in `docs/README.md#why-this-app-is-special`:

- **Auditable** — one log row per *intent*, not per *effect*.
- **Statutorily correct** — the system can no longer be in a
  half-rate state mid-save.

## 5. Risks and trade-offs

- The new endpoint is additive. `POST /api/settings` remains
  for backward compatibility and for one-off scripts.
- A follow-up should deprecate `POST /api/settings` once all
  clients migrate (tracked in
  `docs/changes/2026-09-15-add-settings-batch-endpoint.md#follow-ups`).
- The single `AuditLog` row's `newValue` is JSON-stringified
  text, mirroring the existing pattern. A future migration
  (see `docs/IMPROVEMENTS.md#27`) should switch to `Json`.

## 6. Test plan

- **Manual**: open `/settings`, change 5 fields, save. Refresh
  the page; all 5 changes are visible. Throttle the network to
  "Slow 3G" mid-save; verify no partial state.
- **Unit**: `__tests__/api/settings.batch.test.ts`:
  - Happy path (3 rows updated).
  - Empty array → `400`.
  - Forced failure mid-batch → transaction rolls back, no rows
    updated, no `AuditLog` written.

## 7. Follow-ups

- Migrate the settings page to use the new endpoint (done in
  this PR).
- Deprecate `POST /api/settings` once all clients migrate.
- Add an integration test that exercises the full
  settings-save flow through the UI.
- Migrate `AuditLog` to `Json` columns so batch diffs are
  queryable.
