# Plan: 2026 PAYE Bands + Plain-English Settings UI

## Goal

1. Replace the 2024/25 PAYE bands in `payroll-engine.ts` and the seed with the new 2026 bands, effective 1 Jan 2026.
2. Rebuild the Settings UI so SME users edit every configurable item via category-specific forms in plain English, not raw `statutory.paye_band_3_from`-style keys.

## Decisions (confirmed with user)

- Band count: **dynamic** — engine reads as many `statutory.paye_band_{i}_from/to/rate` rows as exist (4 by default). No hardcoded `Math.max(6, …)`.
- Historical settings: drop everything before 1 Jan 2026 from the seed. Engine keeps "latest value wins" behavior (no effective-date filtering in `buildStatutoryConfigFromSettings`). New app, no legacy data.
- UI scope: full structured UI for **all** categories (COMPANY / PAYROLL / STATUTORY / SYSTEM). Keep a small "Advanced (raw keys)" tab for power users.
- Defaults: just update `DEFAULT_STATUTORY_CONFIG` and the active seed rows; no migration file.

## 2026 PAYE Bands (effective 2026-01-01)

| # | From (MWK) | To (MWK) | Rate |
|---|---|---|---|
| 1 | 0 | 170,000 | 0% |
| 2 | 170,001 | 1,570,000 | 30% |
| 3 | 1,570,001 | 10,000,000 | 35% |
| 4 | 10,000,001 | (open-ended) | 40% |

"Open-ended" = `toAmount = Number.MAX_SAFE_INTEGER` in the engine; UI shows "and above" with an empty input and a helper note.

## Implementation

### 1. Engine — `src/lib/payroll-engine.ts`

- Replace `DEFAULT_STATUTORY_CONFIG.taxBands` with the 4-band array above (band indices 1..4, last band `toAmount = Number.MAX_SAFE_INTEGER`).
- Update file header comment: "PAYE Tax Bands (effective 2026-01-01)".
- Update `calculatePAYE` JSDoc to reference 2026 bands.
- Rewrite `buildStatutoryConfigFromSettings`:
  - Drop the `Math.max(6, base.taxBands.length)` floor.
  - Determine band count by scanning `settingsMap` for the highest index `i` where `statutory.paye_band_{i}_from` OR `_to` OR `_rate` is present. If none, use `base.taxBands.length` (so the engine still works with an empty settings map).
  - For each band `i = 1..count`, pull `from` / `to` / `rate` (fall back to base bands when base has them; otherwise default to safe values).
  - Compute `cumulativeTax` exactly as today.
  - Keep the rest of the function unchanged.

### 2. Seed — `prisma/seed.ts`

- Remove the 6-band PAYE block (`statutory.paye_band_{1..6}_{from,to,rate}` rows).
- Add 4-band block with `effectiveFrom: new Date('2026-01-01')` and values:
  - `paye_band_1_from 0`, `_to 170000`, `_rate 0`
  - `paye_band_2_from 170001`, `_to 1570000`, `_rate 30`
  - `paye_band_3_from 1570001`, `_to 10000000`, `_rate 35`
  - `paye_band_4_from 10000001`, `_to 999999999`, `_rate 40`
- Leave pension, TEVET, fringe benefit, leave/sick days rows as-is (still `effectiveFrom: 2024-07-01` — that's the only sensible "default-from" date for non-PAYE items; no need to change).

### 3. Tests — `src/lib/payroll-engine.test.ts`

Replace the `calculatePAYE` describe block:

- 0 → 0
- 170,000 → 0
- 170,001 → 1 (30% of 1) — boundary, first taxable unit
- 1,570,000 → 30% of (1,570,000 − 170,000) = 30% of 1,400,000 = 420,000
- 1,570,001 → 420,000 + 35% of 1 = 420,001 (round boundary)
- 5,000,000 → 420,000 + 35% of (5,000,000 − 1,570,000) = 420,000 + 35% of 3,430,000 = 420,000 + 1,200,500 = 1,620,500
- 10,000,000 → 420,000 + 35% of 8,430,000 = 420,000 + 2,950,500 = 3,370,500
- 10,000,001 → 3,370,500 + 40% of 1 = 3,370,501
- 20,000,000 → 3,370,500 + 40% of 9,999,999 = 3,370,500 + 4,000,000 (rounded) = 7,370,500

Add to `buildStatutoryConfigFromSettings` describe:

- `it('uses 2026 defaults when no band overrides are set', …)` — assert `cfg.taxBands.length === 4` and the expected from/to/rate values.
- Update the "custom tax-band boundaries" test to assert the new engine returns the right tax for a 2026-shaped override.

### 4. Settings UI — `src/app/settings/page.tsx` (rewrite)

Replace the raw key/value table with a structured, category-driven UI. Keep the existing header, category tabs, and overall styling.

**New layout per active category:**

- **COMPANY** form: Company name, Address, Phone, Email, TPIN, Pension fund. Plain English labels + helper text. Save button shows "Saved at HH:MM" confirmation.
- **PAYROLL** form: Payroll frequency (select: Monthly / Bi-weekly / Weekly), Current period (YYYY-MM), Period start day, Period end day, Working hours per day, Working days per month, Overtime rate multiplier (e.g. "1.5× normal pay"), Currency (select: MWK / USD), Decimal places.
- **STATUTORY** form, broken into sub-sections:
  - **PAYE Tax Bands (effective 2026-01-01)** — table editor:
    - Columns: "Lower limit (MWK)", "Upper limit (MWK)", "Tax rate (%)".
    - First row lower limit is fixed at 0 and shown as read-only "Tax-free threshold starts at".
    - Last row upper limit is optional — empty means "and above".
    - "Add band" / "Remove" per row. Minimum 1 row.
    - Live preview: "PAYE on K 1,000,000 = MWK …" computed client-side.
  - **Pension** — Employee %, Employer %, Max pensionable income, Pension fund name.
  - **Other statutory** — TEVET levy %, Fringe benefit tax %, Annual leave days, Sick leave days.
  - **Effective from** date picker at the top of the section (defaults to today).
- **SYSTEM** form: Default report period, Number format, Date format, Auto-calculate (toggle), Backup enabled (toggle), Audit logging (toggle).

**Persistence:**

- Each form maps its visible fields to the underlying `Settings` keys and `POST`s to the existing `/api/settings` endpoint (upsert per key). The single-key API stays as-is; the UI just sends N upserts per save. Show a per-field error if a single key fails.
- One save button per section (not per field). Disable + spinner while saving. Show "Saved" toast/badge with timestamp.

**API changes:**

- None required for the structured forms — `/api/settings` POST already upserts by `key`.
- Extend the route with a small DELETE handler so users can remove custom rows in the "Advanced" tab: `DELETE /api/settings?key=…`.

**"Advanced (raw keys)" tab** (new fifth tab at the end):

- Keep the existing key/value table for power users / debugging.
- Show a banner: "Editing raw settings can break payroll calculations. Prefer the category tabs above."
- Enable the Delete button (calls the new DELETE endpoint).
- "Add Setting" modal stays as today but defaults `category` to the active structured tab's category.

### 5. Optional niceties (mention in Open Questions if out of scope)

- Preview an employee's payslip for a chosen gross salary given the current statutory config.
- Import a previous year's bands as a starting point.

## Files to change

- `src/lib/payroll-engine.ts` — update `DEFAULT_STATUTORY_CONFIG.taxBands`, JSDoc, and `buildStatutoryConfigFromSettings` band-count logic.
- `src/lib/payroll-engine.test.ts` — rewrite PAYE band tests for 2026; tweak `buildStatutoryConfigFromSettings` tests.
- `prisma/seed.ts` — replace 6 PAYE band rows with 4, update `effectiveFrom`.
- `src/app/settings/page.tsx` — full rewrite with structured per-category forms + Advanced tab.
- `src/app/api/settings/route.ts` — add `DELETE` handler.

No schema migration needed (model unchanged). Re-run `prisma db seed` to pick up the new bands in existing dev DBs.

## Validation

1. `npx vitest run src/lib/payroll-engine.test.ts` — all PAYE band assertions pass.
2. `npm run build` (or `tsc --noEmit`) — no type errors.
3. Manual:
   - Open `/settings` → STATUTORY tab → bands show 4 rows with 2026 values.
   - Change "Max pensionable income" to 2,000,000 → save → reload → persisted.
   - Add a 5th band row (e.g. above 50M at 45%) → save → preview PAYE for 60M shows new top rate applied.
   - Delete a setting via Advanced tab → row removed.
   - Trigger `/api/payroll/calculate` with the updated config → PAYE uses new bands.
4. Re-seed dev DB (`npx prisma db seed`) → only 4 PAYE band rows exist, all `effectiveFrom = 2026-01-01`.

## Out of scope

- Per-employee effective-dated band overrides (audit history).
- Multi-currency conversion.
- Tax-band versioning UI (history view).