# PAYE silently returns 0 when income exceeds a finite top tax band

**Type:** bugsfix
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** docs/IMPROVEMENTS.md M5

---

## 1. Bug

`calculatePAYE()` in `src/lib/payroll-engine.ts` located the applicable tax
band with:

```ts
const band = config.taxBands.find(b => taxable >= b.fromAmount && taxable <= b.toAmount);
if (!band) return 0;   // ← silent zero tax
```

The default 4-band config ends at `Number.MAX_SAFE_INTEGER` so it "works" by
accident — but `validateTaxBands()` never required the final band to be
unbounded, and the settings-driven builder could produce a finite top band
(the seed previously set `paye_band_4_to = 999999999`). Any gross income above
that ceiling fell through to `return 0`, i.e. **PAYE silently zero.**

For a statutorily-regulated payroll engine this is a critical correctness bug:
a salary just above the ceiling produces a payslip showing `PAYE: 0` with no
error.

## 2. Fix

Two defense-in-depth layers in `src/lib/payroll-engine.ts`:

1. **`buildStatutoryConfigFromSettings`** now forces the final tax band's
   `toAmount` to `Number.MAX_SAFE_INTEGER` regardless of what the settings rows
   contain. A finite top band (e.g. the legacy seed value) is normalised to
   unbounded, so every income resolves to a band.

2. **`calculatePAYE`** throws an explicit error instead of returning `0` when no
   band matches:

   ```ts
   throw new Error(
     `Income ${taxable} falls outside the configured PAYE tax bands; no band matched. ` +
     'Ensure the final tax band is unbounded.'
   );
   ```

   This only fires for hand-assembled configs built outside
   `buildStatutoryConfigFromSettings` — the settings builder already normalised
   the bands — and is the last line of defence.

## 3. Seed data

`prisma/seed.ts` now seeds `statutory.paye_band_4_to` as
`Number.MAX_SAFE_INTEGER` (`"9007199254740991"`) instead of the legacy
`"999999999"`, and uses the compound upsert key
`key_businessId_effectiveFrom` to match the new history-aware uniqueness
constraint.

## 4. Tests added

`src/lib/payroll-engine.test.ts` → new tests in the
`buildStatutoryConfigFromSettings` describe block:

- `normalizes a finite top band to unbounded so no income is silently untaxed`
- `calculatePAYE throws when a hand-built config matches no band`

## 5. Verification

- `npx tsc --noEmit` — clean.
- `npx prisma validate` — schema valid.
- `npx vitest run src/lib/payroll-engine.test.ts` — 29/29 pass (27 existing +
  2 new).