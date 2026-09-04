# Bug: Settings batch save still 500s on PAYROLL / STATUTORY / SYSTEM tabs for ADMIN

**Severity:** high
**Date discovered:** 2026-09-04
**Date fixed:** 2026-09-04
**Reporter:** user (ADMIN saving settings)
**Related issue/PR:** none

---

## 1. Symptom

As a tenant ADMIN, clicking "Save Payroll Settings", "Save Statutory
Settings", or "Save System Settings" on `/settings` returned
`500 { success: false, error: "Internal server error" }` and showed a
failure toast. The COMPANY tab appeared to work. Supersedes (but does not
duplicate) [`2026-09-04-settings-batch-save-500.md`](./2026-09-04-settings-batch-save-500.md),
which raised the transaction budget from 5 s to 15 s — insufficient on
this connection (see Root cause).

## 2. Reproduction

1. Log in as ADMIN (any business; the `Wiztech` business reproduces
   reliably on a cold connection).
2. Open `/settings` → PAYROLL tab → "Save Payroll Settings" (11 keys),
   STATUTORY tab (20 keys), or SYSTEM tab (6 keys) → `POST
   /api/settings/batch`.
3. Response: `500 { success: false, error: "Internal server error" }`.
4. Server log: `Transaction API error: A rollback/commit cannot be
   executed on an expired transaction. The timeout for this transaction
   was 15000 ms, however ~15850-17309 ms passed…` (code `P2028`).

Reproduced deterministically with a scratch `tsx` script running the
route's exact upsert array against the live DB (scripts removed after
use): PAYROLL (11 rows), SYSTEM (6 rows), and STATUTORY (20 rows) all
failed with `P2028` under `{ timeout: 15000, maxWait: 10000 }`.

## 3. Impact

- **High:** tenant ADMINs could not save payroll, statutory, or system
  settings at all on slow/cold connections — exactly when a new business
  needs them most. No partial writes (the transaction rolled back), so
  data stayed consistent but unchanged.
- COMPANY saves only looked healthy because they were retried on warm
  connections; the same timeout applied to them.

## 4. Root cause

`src/app/api/settings/batch/route.ts` ran its N-row upsert array through
`prisma.$transaction(rows)` — one round-trip per row. Measured per-query
latency on this (Neon/pooled) connection is ~1–3 s cold (single upsert:
~10 s; 6 sequential upserts: ~23 s). So even a 6-row SYSTEM batch needs
~16 s and a 20-row STATUTORY batch ~17 s+, exceeding the 15 s
interactive-transaction budget from the prior fix. Any fixed timeout is
fragile here because cost scales with payload size × connection latency.
Verified: identical statements succeed as a single round-trip; the SQL
was never wrong, only the clock.

Distinguished from the prior fix: that fix correctly diagnosed the
timeout class and the engine-throw class, but its remedy (raising the
budget 5 s → 15 s) could not hold for larger tabs on slower connections.

## 5. Fix

- `src/app/api/settings/batch/route.ts` — replaced the N-row interactive
  `$transaction` with a single-statement batch upsert plus a re-read:
  ```ts
  await prisma.$executeRaw`
    INSERT INTO "settings" ("id", "key", "value", "description", "category", "effective_from", "business_id")
    VALUES ${Prisma.join(validatedData.map((row) => Prisma.sql`(gen_random_uuid(), ...)`))}
    ON CONFLICT ("key", "business_id") DO UPDATE SET
      "value" = EXCLUDED."value",
      "description" = EXCLUDED."description",
      "category" = EXCLUDED."category",
      "effective_from" = EXCLUDED."effective_from"
  `;
  const results = await prisma.settings.findMany({
    where: { businessId, key: { in: validatedData.map((row) => row.key) } },
  });
  ```
  One round-trip for all rows (implicitly atomic, no interactive-transaction
  timeout to expire), one re-read to preserve the `{ success: true, data }`
  contract, then the existing single `logAuditEvent` write. Validation
  (departments check, statutory band build + `validateTaxBands` → 400) is
  unchanged and still runs before the write. Safe because the route
  guarantees a non-null `businessId`, so the `("key", "business_id")`
  conflict target always applies.

## 6. Verification

- Scratch repro against the live DB (same payloads the tabs send):
  20-row STATUTORY raw batch **OK in ~6.2 s cold** (was guaranteed 500);
  11-row PAYROLL **OK in ~1.6 s warm**; 6-row SYSTEM **OK in ~1.3 s warm**;
  categories/values re-read correctly (`currency=MWK[PAYROLL]`,
  `statutory.pension_ee_rate=5[STATUTORY]`,
  `auto_calculate=true[SYSTEM]`). Scratch files removed after use.
- `npx tsc --noEmit` — clean; `npx eslint` on the touched file — 0
  errors; `npx vitest run src/lib/payroll-engine.test.ts` — 27 passed
  (statutory validation paths untouched).

## 7. Prevention

- Batch write routes must not scale round-trips with payload size inside
  an interactive transaction on pooled connections. Prefer single-statement
  upserts (`INSERT ... ON CONFLICT`) for key/value-style batches; reserve
  `$transaction` for small, fixed-size multi-model writes.
- Follow-up worth considering (not done here): extract a shared
  `upsertSettingsBatch(businessId, rows)` helper so the single-POST route
  (`src/app/api/settings/route.ts`) and the batch route cannot drift, and
  consider the same single-statement pattern there if single upserts stay
  marginal (~10 s cold) on this connection.
