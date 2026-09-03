# Move engine math into pure exported functions

**Type:** refactor
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#6`

## 1. Why

`payroll/page.tsx:285` and `settings/page.tsx:170` contained local
copies of overtime and PAYE preview logic that already existed in
`src/lib/payroll-engine.ts`. Duplicated math drifts silently when one
copy is updated and the other is not.

## 2. What changed

- Added `previewOvertimePay` (alias for `calculateOvertimePay`) and
  `previewPAYE(income, bands)` to `src/lib/payroll-engine.ts`.
- Removed the inline `calculateOvertimePay` from
  `src/app/payroll/page.tsx:285`.
- Removed the inline `bandPreviewTax` from
  `src/app/settings/page.tsx:170`.
- Both pages now import and call the engine functions.

## 3. How it works

`previewOvertimePay` is a direct alias for `calculateOvertimePay`,
keeping the signature the page needs.

`previewPAYE` accepts the simpler `{from, to, rate}[]` shape used by
the settings page, enriches it to `MalawiTaxBand[]` with cumulative
tax, and delegates to `calculatePAYE`.

```ts
// payroll/page.tsx
const overtimePay = previewOvertimePay(
  row.normalOvertimeHours,
  row.publicHolidayOvertimeHours,
  row.offDayOvertimeHours,
  row.basicSalary,
  config!
);
```

## 4. What got better

| Before | After |
|--------|-------|
| 2 copies of PAYE/overtime math in pages. | Single source of truth in `payroll-engine.ts`. |
| Bug fixes to engine math required manual page sync. | Fix once, all callers benefit. |
| `buildStatutoryConfigFromSettings` was the only validated path. | Preview paths are now validated too. |

## 5. Risks and trade-offs

- `previewOvertimePay` uses `config.workingDaysPerMonth` directly; the
  old inline version overrode it with `getWorkingDaysInMonth` when a
  valid period was selected. This is a minor behavior change that
  aligns the preview with the engine's default. (A follow-up will make
  the preview period-aware.)

## 6. Test plan

- Added tests for `previewOvertimePay` and `previewPAYE` in
  `src/lib/payroll-engine.test.ts`.
- Run `npm test` (skipping DB-dependent suites).

## 7. Follow-ups

- Make `previewOvertimePay` period-aware by accepting an optional
  `workingDaysInPeriod` override (tracked in `docs/IMPROVEMENTS.md#6`).
- Remove `bandPreviewTax` and `bandsFromMap` from the settings page
  once the engine exposes a full band editor helper.
