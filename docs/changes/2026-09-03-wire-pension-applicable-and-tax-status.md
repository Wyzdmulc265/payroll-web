# Wire `pensionApplicable` and `taxStatus` into payroll engine

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#11`

## 1. Why

The `Employee` model had `pensionApplicable` and `taxStatus` fields,
but the engine ignored them. Every employee was taxed and had pension
deductions regardless of their actual status. This produced incorrect
payslips for exempt or non-pension-eligible staff.

## 2. What changed

- `PayrollInput` now accepts optional `pensionApplicable` and
  `taxStatus`.
- `calculatePayroll` skips pension EE/ER when `pensionApplicable` is
  `false`.
- `calculatePayroll` sets `paye = 0` when `taxStatus === 'Exempt'`.
- `POST /api/payroll` passes `emp.pensionApplicable` and
  `emp.taxStatus` through to the engine.

## 3. How it works

```ts
const isPensionApplicable = input.pensionApplicable ?? true;
const isTaxExempt = input.taxStatus === 'Exempt';
const paye = isTaxExempt ? 0 : calculatePAYE(grossEarnings, config);
const pensionEE = isPensionApplicable ? calculatePensionEE(grossEarnings, config) : 0;
const pensionER = isPensionApplicable ? calculatePensionER(grossEarnings, config) : 0;
```

Defaults preserve backward compatibility: missing fields behave as
before (`true` for pension, `'Taxable'` for tax).

## 4. What got better

| Before | After |
|--------|-------|
| All employees always taxed and pensioned. | Exempt employees pay 0 PAYE; non-pensionable staff skip pension. |

## 5. Risks and trade-offs

- Historical payroll runs that were saved with the old behavior will
  not be retroactively corrected. Only new runs use the updated logic.

## 6. Test plan

- Added unit tests for `calculatePayroll` with `pensionApplicable:
  false` and `taxStatus: 'Exempt'`.
- Run `npm test` (skipping DB-dependent suites).

## 7. Follow-ups

- Expose `pensionApplicable` and `taxStatus` in the employee form
  validation (already present in schema).
