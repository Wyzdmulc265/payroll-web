# Implement Fringe Benefit Tax (FBT)

## Why

The payroll system declared `statutory.fringe_benefit_tax_rate` in `Settings` and exposed it in the UI, but the value was never actually calculated, persisted, or shown on payslips, reports, or the dashboard. This change closes that gap so operators can enter per-employee fringe-benefit amounts per period and see the computed FBT everywhere it belongs.

- **Audit trigger**: `docs/changes/2026-09-01-fringe-benefit-tax-audit.md`
- **Legal/architectural spec**: `docs/FRINGE-BENEFIT-TAX-PROMPT.md`

## What changed

- **New `FringeBenefit` model** — one row per benefit entry per payroll period, with type, amount, taxable value, and an index on `payrollRecordId`.
- **New columns on `PayrollRecord`** — `fringeBenefitBase` (sum of taxable values), `fringeBenefitTax` (employer liability), and `fbtSnapshot` (JSON audit trail).
- **New `src/lib/fbt-engine.ts`** — classification logic, per-type valuation rules (motor vehicle, housing, school fees, airtime/data, concessionary loans, and a default employer-cost rule), and `calculateEmployerFBT` aggregation.
- **Payroll engine integration** — `calculatePayroll` now accepts `fringeBenefits` in `PayrollInput`, adds `fringeBenefitBase`, `fringeBenefitTax`, and `fbtResult` to `PayrollResult`, and includes FBT in `employerCost` (not employee `totalDeductions`).
- **API routes updated**:
  - `POST /api/payroll` accepts `fringeBenefitData`, persists `FringeBenefit` rows inside the same transaction, stores `fbtSnapshot`.
  - `POST /api/payroll/calculate` accepts `fringeBenefits` and returns FBT fields.
  - `GET /api/payslips/[id]` includes `fringeBenefitBase`, `fringeBenefitTax`, and summarized `fbtSummary`.
  - `GET /api/fbt` (new) — quarterly per-employee FBT detail for MRA compliance.
  - `GET /api/dashboard` — `totalFBT` KPI and per-department FBT.
  - `GET /api/reports` — `FBT Base` and `FBT` columns added to Payroll Register, Payroll Summary, Department Payroll, and Employee Earnings History; `Total FBT` added to Statutory Summary.
- **UI updates**:
  - Payroll page table now shows FBT Base and FBT columns and totals.
  - Payslip page shows Employer FBT section (base, rate, tax) when FBT is present.
  - Dashboard shows a `Total FBT` KPI card.
  - Settings page helper text updated for the FBT rate field.
- **Documentation updated** — `docs/ENGINE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/UI.md`.

## How it works

### Money-safe arithmetic

All intermediate FBT calculations use `Decimal` from `decimal.js`. The final MWK output is rounded to the nearest integer via `Math.round`. This prevents floating-point drift in intermediate steps.

### Classification

Each benefit is classified before valuation:

| Classification | Meaning |
|----------------|---------|
| `FBT` | Taxable fringe benefit — goes through valuation rules |
| `PAYE_NOT_FBT` | Cash benefit (cash allowance, cash bonus, cash housing/transport allowance) — taxed under PAYE, not FBT |
| `EXCLUDED` | Excluded under MRA guidance (housing advances, funeral advances, school fees advances, medical advances) |

School fees are a special case: **direct payment to institution** is `FBT` at 50% of cost, while **cash or advance** is `EXCLUDED`.

### Valuation rules (v1)

| Benefit type | Rule | Source |
|-------------|------|--------|
| `MOTOR_VEHICLE` | `originalCost × 15%` | MRA FBT guidelines |
| `HOUSING_EMPLOYER_OWNED` (unfurnished) | `10% × basicSalary` | MRA FBT guidelines |
| `HOUSING_EMPLOYER_OWNED` (furnished) | `12% × basicSalary` | MRA FBT guidelines |
| `HOUSING_RENTED` | `MIN(employerRentalCost, openMarketRentalValue)` | MRA FBT guidelines |
| `SCHOOL_FEES` (direct to institution) | `amount × 50%` | MRA FBT guidelines |
| `SCHOOL_FEES` (cash/advance) | `EXCLUDED` | MRA FBT guidelines |
| `AIRTIME_DATA` (on/after 2024-04-01) | `amount × 50%` | 2024 Amendment Regulations |
| `AIRTIME_DATA` (before 2024-04-01) | `amount × 100%` | Prior rules |
| `UTILITIES`, `HOUSEHOLD_ITEMS`, `VACATION`, `TRAVEL`, `DOMESTIC_SERVICE`, `OTHER_BENEFIT` | `employerCost` | MRA FBT guidelines |
| `CONCESSIONARY_LOAN` | `principal × (benchmarkRate - employerRate) × periodFraction` | MRA FBT guidelines |

### Employee contributions

Where an employee makes a qualifying contribution:

```
taxableValue = MAX(0, grossTaxableValue - employeeContribution)
```

The gross value and contribution are stored separately in the audit trail.

### Aggregation

```
fringeBenefitsTax = ROUND(totalTaxableValue × fbtRate / 100)
```

`fringeBenefitsTax` is added to `employerCost` by `calculatePayroll`. `totalDeductions` and `netPay` are unchanged.

### Effective-date rule selection

The rules engine selects the applicable rule by benefit type + benefit effective date. If no rule matches, it throws `TaxRuleNotFoundError` rather than silently applying the latest rule.

### Integration with `calculatePayroll`

```ts
const fbtResult = calculateEmployerFBT(input.fringeBenefits ?? [], config);
const employerCost = calculateEmployerCost(grossEarnings, pensionER, tevetLevy)
  + fbtResult.fringeBenefitsTax;
```

## What got better

- **Statutorily correct** — FBT is treated as an employer-side liability, not a payroll deduction.
- **Historically reproducible** — `fbtSnapshot` freezes the per-employee breakdown used at payroll run time.
- **Decimal-safe** — `Decimal.js` guards intermediate arithmetic.
- **Auditable** — every benefit calculation produces an `auditTrail` with rule, source, formula, inputs, and result.
- **Type-safe** — new enums and interfaces enforce benefit types and payment methods at compile time.
- **Testable in isolation** — the FBT rules engine lives in its own module with a dedicated test file.

## Risks and trade-offs

- **Migration ordering** — `FringeBenefit` depends on `PayrollRecord.id`. The migration runs after `20260901170112_add_overtime_hours_to_payroll_record`; no ordering risk.
- **Decimal precision** — `Decimal.js` is used for intermediates; `Math.round` at final output. `Number()` coercion at API boundary is preserved.
- **`fbtSnapshot` population** — if not populated, historical FBT calculations cannot be reproduced. This plan includes it explicitly.
- **Effective-date rule failure** — if a benefit has no matching rule for its effective date, the engine throws `TaxRuleNotFoundError`. The UI must surface this clearly.
- **`decimal.js` dependency** — new runtime dependency, already added to `package.json`.
- **Migration must be applied before code that references new columns** — during development the migration SQL was generated but not applied to the database, causing a 500 error on every payroll save until `npx prisma migrate deploy` was run. See `docs/bugsfix/2026-09-01-payroll-save-500-migration-not-applied.md`.

## Test plan

- **New file `src/lib/fbt-engine.test.ts`** — 15+ test cases:
  - Classification: cash transport allowance, cash housing allowance, school fees advance, direct school fees.
  - Motor vehicle: standard 15%, missing original cost.
  - Housing: unfurnished (10%), furnished (12%), rented (capped), employee contribution reduction.
  - School fees: direct payment (50%), cash (excluded), advance (excluded).
  - Airtime/data: before 2024-04-01 (100%), on/after (50%).
  - Concessionary loan: principal × rate diff × period fraction.
  - Aggregation: multiple benefits, FBT rate rounding, employer-side liability, cash benefits excluded.
  - `summarizeFBTResult`: groups by benefit type.
- **Extended `src/lib/payroll-engine.test.ts`**:
  - `calculatePayroll` with empty `fringeBenefits` (regression — unchanged behavior).
  - `calculatePayroll` with motor vehicle benefit — FBT lands in `employerCost`, `netPay` unchanged.

## Follow-ups

Deferred from this implementation (see plan §10):

- **Employee-level default benefit amounts** — deferred to follow-up.
- **Benefit-type CRUD in Settings** — types are hard-coded enum for v1.
- **FBT exemption logic** — `Employee.taxStatus` is a dead field today (`docs/IMPROVEMENTS.md#11`). FBT exemption rules are not wired.
- **PDF generation** — existing "Export PDF" uses `window.print()`.
- **Authentication / authorization** — all API routes remain public until `next-auth` is wired.
- **Quarterly MRA return submission** — the report data is prepared but not auto-submitted.
- **Concessionary loan amortization schedule** — v1 uses a simplified period-fraction calculation.

## Cross-links

- `docs/changes/2026-09-01-fringe-benefit-tax-audit.md` — the audit that triggered this work
- `docs/FRINGE-BENEFIT-TAX-PROMPT.md` — the legal/architectural spec
- `docs/bugsfix/2026-09-01-payroll-save-500-migration-not-applied.md` — the 500 error bug caused by the migration not being applied during development
- `docs/IMPROVEMENTS.md` — no FBT-specific entry added in this change
