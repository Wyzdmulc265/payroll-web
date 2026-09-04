# Bug: Settings batch save fails with 500 "Internal server error"

**Severity:** high
**Date discovered:** 2026-09-04
**Date fixed:** 2026-09-04
**Reporter:** user (ADMIN saving settings)
**Related issue/PR:** none

---

## 1. Symptom

As a tenant ADMIN, clicking any "Save … Settings" button showed a failure
toast (`Batch save failed` / `Internal server error`). The single-setting
Advanced flow kept working. Retries sometimes helped, sometimes not.

## 2. Reproduction

1. Log in as ADMIN of any business (a fresh business with few or no settings
   rows reproduces most reliably on a cold connection).
2. Open `/settings` → COMPANY tab → "Save Company Settings" (6 keys posted
   to `POST /api/settings/batch`).
3. Response: `500 { success: false, error: "Internal server error" }`.
4. Server log: `Transaction API error: A rollback cannot be executed on an
   expired transaction. The timeout for this transaction was 5000 ms…`

Reproduced deterministically with a scratch vitest calling the route with a
6-row COMPANY batch on a fresh business (later removed).

## 3. Impact

- **High:** tenant settings (company, payroll, statutory, system) could not
  be saved whenever the connection was slow — the exact moment a new business
  needs them most. No partial writes: the transaction rolled back, so data
  stayed consistent, just unchanged.

## 4. Root cause

Two independent defects, both surfacing as the same 500:

1. **Transaction timeout.** `src/app/api/settings/batch/route.ts` ran its
   N-row upsert array through `prisma.$transaction(rows)` with the **default
   5 s interactive-transaction timeout**. Each upsert is a round-trip, so on
   a cold/pooled Neon connection (~1 s per query) a normal 6-key tab save
   exceeded the budget; Prisma expired the transaction and the catch-all
   returned 500. The single-setting route had the same default and was
   marginal for the same reason. Verified: identical upserts succeed outside
   the 5 s budget and via the route once the budget is raised — the SQL was
   never wrong, only the clock.
2. **Engine throw on invalid bands.** `buildStatutoryConfigFromSettings`
   (`src/lib/payroll-engine.ts:141`) *throws* when the merged band set is
   invalid (overlap, gap, negative rate…), and both settings routes called it
   outside any try/catch — so saving STATUTORY with inconsistent bands (e.g.
   band 2 starting inside band 1) fell into the catch-all 500. The adjacent
   `validateTaxBands` → 400 check was dead code in exactly this case, since
   the throw happened first. Verified: overlapping-band batch returned 500
   before, `400 "Band 2 overlaps with band 1"` after.

## 5. Fix

- `src/app/api/settings/batch/route.ts` — batch transaction now uses
  `{ timeout: 15000, maxWait: 10000 }`, matching the convention already used
  by the businesses/account/admin routes; engine call wrapped in
  try/catch → 400 with the validation message.
- `src/app/api/settings/route.ts` (single POST) — same explicit timeouts
  plus the same try/catch around the engine call.

## 6. Verification

- Scratch route-level repros (fresh business, ADMIN session):
  6-row COMPANY batch **500 before → 200 after** the timeout fix
  (raw-upsert control confirmed the statements were always fine);
  overlapping-band STATUTORY batch **500 before → 400 "Band 2 overlaps with
  band 1" after** the try/catch fix (scratch file removed after use).
- `npx tsc --noEmit` — clean; `npx eslint` on touched files — 0 errors
  (2 pre-existing unrelated warnings).
- Note: under artificially sustained pooler load, requests can still exceed
  any fixed budget; that is capacity, not a code defect — the 15 s budget
  matches every other write route in the codebase.

## 7. Prevention

- New write routes must set explicit `$transaction` timeouts instead of
  relying on Prisma's 5 s default — especially batch endpoints whose
  round-trip count scales with the payload. Consider a shared
  `WRITE_TX_OPTIONS` constant so the budget cannot drift per route.
- The catch-all 500 should log (it does) *and* the client should surface
  `details` where present, so the next timeout-like failure is diagnosable
  from the UI.
