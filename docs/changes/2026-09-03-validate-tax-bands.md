# Validate PAYE tax bands for gaps and overlaps

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#8`

## 1. Why

The settings UI accepted any combination of PAYE band boundaries
without checking for gaps or overlaps. A user could enter band 1
`0–200000` and band 2 `150000–500000`, creating a gap between 200001
and 149999 and an overlap between 150000 and 200000. The engine would
then silently produce incorrect tax calculations.

## 2. What changed

- Added `validateTaxBands(bands): string | null` to
  `src/lib/payroll-engine.ts`.
- `buildStatutoryConfigFromSettings` now throws on invalid bands.
- `POST /api/settings` (single) and `POST /api/settings/batch`
  both validate statutory settings before persisting and return
  `400 { error: <human-readable message> }` on failure.

## 3. How it works

```ts
export function validateTaxBands(bands: MalawiTaxBand[]): string | null {
  if (bands.length === 0) return 'At least one tax band is required';
  if (bands[0].fromAmount !== 0) return 'First tax band must start at 0';
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.ratePercent < 0) return `Band ${i + 1} rate cannot be negative`;
    if (b.toAmount < b.fromAmount) return `Band ${i + 1} toAmount cannot be less than fromAmount`;
    if (i > 0) {
      const prev = bands[i - 1];
      if (b.fromAmount <= prev.toAmount) return `Band ${i + 1} overlaps with band ${i}`;
      if (b.fromAmount > prev.toAmount + 1) return `Gap between band ${i} and band ${i + 1}`;
    }
  }
  return null;
}
```

Both settings handlers build a temporary config from the proposed
changes and call `validateTaxBands` before writing.

## 4. What got better

| Before | After |
|--------|-------|
| Gaps and overlaps silently accepted. | 400 returned with a human-readable message. |
| `buildStatutoryConfigFromSettings` could produce invalid configs. | Always returns a valid, gap-free band set or throws. |

## 5. Risks and trade-offs

- Existing settings with gaps/overlaps will now cause saves to fail.
  Administrators must clean up the bands before saving.
- `validateTaxBands` requires a contiguous sequence from 0 with no
  gaps larger than 1 MWK. This matches the PAYE formula's assumption.

## 6. Test plan

- Added unit tests for `validateTaxBands` in
  `src/lib/payroll-engine.test.ts`.
- Run `npm test` (skipping DB-dependent suites).

## 7. Follow-ups

- Surface validation errors inline in the settings UI band editor
  instead of as a toast (tracked in `docs/IMPROVEMENTS.md#8`).
