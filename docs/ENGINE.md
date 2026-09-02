# Payroll Engine

`src/lib/payroll-engine.ts` is the **heart of WizTech Payroll Web** — a pure,
dependency-free TypeScript module that computes Malawi statutory payroll.

This document is the canonical reference for every type, constant, and
function exported from the engine, the math behind each calculation, and an
end-to-end worked example.

---

## 1. Design Principles

1. **Pure** — no I/O, no Prisma, no `fetch`, no `process.env`. Inputs in,
   values out. Deterministic. Side-effect free.
2. **Decimal-safe** — every money-mixing function coerces its inputs through
   `Number()` to defend against Prisma `Decimal` values that arrive as
   strings (a notorious JSON-serialization footgun).
3. **Statutorily correct** — every formula is the literal translation of the
   Malawi PAYE / Pension / TEVET rules.
4. **Configurable via data** — rates and bands are *not* hard-coded; they are
   loaded from the `Settings` table by `buildStatutoryConfigFromSettings`,
   and `DEFAULT_STATUTORY_CONFIG` is the safe fallback.
5. **Auditable** — `PayrollRecord.configSnapshot` freezes the config that was
   actually used, so historical payslips stay correct after rates change.
6. **Tested** — see `src/lib/payroll-engine.test.ts` (~30 Vitest cases).

---

## 2. Exported Types

### `MalawiTaxBand`

```ts
interface MalawiTaxBand {
  band: number;            // 1-based index
  fromAmount: number;      // first income value in this band (inclusive)
  toAmount: number;        // last income value in this band (inclusive); MAX_SAFE_INTEGER for the top band
  ratePercent: number;     // marginal rate
  fixedAmount: number;     // reserved; currently 0
  cumulativeTax: number;   // tax owed on all income up to (fromAmount - 1)
}
```

### `StatutoryConfig`

The full set of statutory and payroll parameters. See the source for the
exact field list (lines 16–44 of the engine). Highlights:

| Field | Meaning |
| --- | --- |
| `taxBands` | `MalawiTaxBand[]` in ascending order. |
| `pensionEEPercent` | Employee pension % (default 5). |
| `pensionERPercent` | Employer pension % (default 10). |
| `maxPensionableIncome` | Cap on pensionable income (default 1,000,000 MWK). |
| `tevetLevyPercent` | TEVET levy % (default 1). |
| `fringeBenefitTaxRate` | Fringe benefit tax % (default 30). |
| `leaveDaysPerYear`, `sickDaysPerYear` | Leave entitlements (informational; not used in monthly math). |
| `workingHoursPerDay` | Default 8. |
| `workingDaysPerMonth` | Default 22; *overridden* by `workingDaysInPeriod` when provided. |
| `overtimeNormalRateMultiplier` | Default 1.5. |
| `overtimePublicHolidayRateMultiplier` | Default 2.0. |
| `overtimeOffDayRateMultiplier` | Default 2.0. |
| `currency` | ISO 4217, default `'MWK'`. |
| `decimalPlaces` | Default 2. |

### `PayrollInput` and `PayrollResult`

`PayrollInput` is the per-employee, per-period input. `PayrollResult` is the
full breakdown returned by `calculatePayroll`. They share several fields
verbatim (basic, allowances, overtime hours, bonuses, other earnings /
deductions) so the result can be rendered as a payslip without re-fetching
the input.

### `SettingRow`

```ts
interface SettingRow {
  key: string;
  value: string;                         // every value is stored as text
  effectiveFrom?: Date | string | null;  // optional
}
```

This is the shape of a row from the `Settings` table when read from
Prisma. It is also the shape `selectEffectiveSettings` accepts.

---

## 3. `DEFAULT_STATUTORY_CONFIG`

A hard-coded 4-band Malawi 2026 PAYE table:

| Band | From (MWK) | To (MWK) | Rate | Cumulative tax at band start |
| --- | --- | --- | --- | --- |
| 1 | 0 | 170,000 | 0 % | 0 |
| 2 | 170,001 | 1,570,000 | 30 % | 0 |
| 3 | 1,570,001 | 10,000,000 | 35 % | 420,000 |
| 4 | 10,000,001 | `MAX_SAFE_INTEGER` | 40 % | 3,370,500 |

Plus pension (5 % / 10 %, capped at MWK 1,000,000), TEVET 1 %, and overtime
multipliers 1.5 / 2 / 2.

This is what `buildStatutoryConfigFromSettings` falls back to whenever a key
is missing or unparseable.

---

## 4. Functions

### 4.1 `buildStatutoryConfigFromSettings(settingsMap, base?)`

Builds a `StatutoryConfig` from a flat `{ key: value }` map of `Settings`
rows. Anything missing or unparseable falls back to `base`
(defaults to `DEFAULT_STATUTORY_CONFIG`).

**Supported keys** (see `prisma/schema.prisma` + `prisma/seed.ts`):

```
statutory.paye_band_{N}_from      → taxBands[i].fromAmount
statutory.paye_band_{N}_to        → taxBands[i].toAmount
statutory.paye_band_{N}_rate      → taxBands[i].ratePercent
statutory.pension_ee_rate         → pensionEEPercent
statutory.pension_er_rate         → pensionERPercent
statutory.max_pensionable_income  → maxPensionableIncome
statutory.tevet_levy_rate         → tevetLevyPercent
statutory.fringe_benefit_tax_rate → fringeBenefitTaxRate
statutory.overtime_normal_rate_multiplier
statutory.overtime_public_holiday_rate_multiplier
statutory.overtime_off_day_rate_multiplier
working_hours_per_day             → workingHoursPerDay
working_days_per_month            → workingDaysPerMonth
currency                          → currency
decimal_places                    → decimalPlaces
```

**Band auto-discovery.** The function scans the settings map for keys
matching `statutory.paye_band_(\d+)_(from|to|rate)` and uses the highest
index found as the band count. New bands can be added in `Settings` without
a code change.

**Cumulative tax re-derivation.** After populating each band, the function
walks the array and sets `cumulativeTax[i] = cumulativeTax[i-1] +
rate[i-1] × (toAmount[i-1] - fromAmount[i-1] + 1)`. This means band
boundaries can be changed in `Settings` and PAYE math will keep working
correctly without a code deploy.

### 4.2 `calculatePAYE(grossIncome, config?)`

Progressive tax using Malawi bands.

```
band = first b in config.taxBands where grossIncome ∈ [b.fromAmount, b.toAmount]
if !band  → return 0   (safety; gaps shouldn't exist but we don't crash)
if band.ratePercent === 0 → return 0
excess = grossIncome - (band.fromAmount - 1)
return round(band.cumulativeTax + excess × band.ratePercent / 100)
```

The `(band.fromAmount - 1)` offset is the *tax-free threshold* — the last
income value in the previous band. This is the only correct way to compute
progressive tax; using `band.fromAmount` directly would double-count the
boundary value.

### 4.3 `calculatePensionEE` and `calculatePensionER`

```
pensionableIncome = min(grossIncome, config.maxPensionableIncome)
return round(pensionableIncome × percent / 100)
```

`pensionEEPercent` defaults to 5, `pensionERPercent` to 10, and the cap
defaults to MWK 1,000,000.

### 4.4 `calculateTEVETLevy(grossIncome, config?)`

```
return round(grossIncome × config.tevetLevyPercent / 100)
```

Default 1 %.

### 4.5 `calculateOvertimePay(normal, holiday, offDay, basicSalary, config?, workingDaysInPeriod?)`

```
hourlyRate = basicSalary / workingDays / config.workingHoursPerDay
   where workingDays = workingDaysInPeriod ?? config.workingDaysPerMonth
return round(
    normal  × 1.5 × hourlyRate   // normal-day OT
  + holiday × 2.0 × hourlyRate   // public-holiday OT
  + offDay  × 2.0 × hourlyRate   // off-day OT
)
```

`workingDaysInPeriod` is the killer feature. If a pay period falls in a
month with 23 working days (instead of the default 22), the hourly rate is
correctly lower, and the OT bill is correspondingly smaller. This is
computed at the route layer with `getWorkingDaysInMonth(year, month)`.

### 4.6 `calculateGrossEarnings(basic, allowances, overtimePay, bonuses, otherEarnings)`

```
return Number(basic) + Number(allowances) + Number(overtimePay) + Number(bonuses) + Number(otherEarnings)
```

`Number(...)` coercion is the **Decimal-safety guard**. Without it, a
Prisma `Decimal` would arrive over JSON as the string `"5000.00"` and
`"5000.00" + "1000.00"` would produce `"5000.001000.00"`.

### 4.7 `calculateTotalDeductions(paye, pensionEE, otherDeductions)`

`return paye + pensionEE + otherDeductions` (each `Number()`-coerced).

### 4.8 `calculateNetPay(grossEarnings, totalDeductions)`

`return grossEarnings - totalDeductions`.

### 4.9 `calculateEmployerCost(grossEarnings, pensionER, tevetLevy)`

`return grossEarnings + pensionER + tevetLevy` — the cost to the company,
not the take-home. Used for the dashboard's "Employer Cost" KPI.

### 4.10 `calculatePayroll(input, config?)` — the orchestrator

```ts
function calculatePayroll(input, config = DEFAULT_STATUTORY_CONFIG): PayrollResult {
  const overtimePay     = calculateOvertimePay(...);
  const grossEarnings   = calculateGrossEarnings(...);
  const paye            = calculatePAYE(grossEarnings, config);
  const pensionEE       = calculatePensionEE(grossEarnings, config);
  const pensionER       = calculatePensionER(grossEarnings, config);
  const tevetLevy       = calculateTEVETLevy(grossEarnings, config);
  const totalDeductions = calculateTotalDeductions(paye, pensionEE, input.otherDeductions);
  const netPay          = calculateNetPay(grossEarnings, totalDeductions);
  const employerCost    = calculateEmployerCost(grossEarnings, pensionER, tevetLevy);
  return { ...input, overtimePay, grossEarnings, paye, pensionEE, pensionER, tevetLevy, totalDeductions, netPay, employerCost };
}
```

This is the only function the API routes need to call.

### 4.11 `formatCurrency(amount, currency?, decimals?)`

Thin wrapper around `Intl.NumberFormat('en-MW', ...)`. Used by the payslip
view and the dashboard.

### 4.12 `roundToDecimals(value, decimals?)`

Standard `Math.round(value × 10^decimals) / 10^decimals`. Used by the
reports when computing department roll-ups.

### 4.13 `selectEffectiveSettings(rows, asOf)`

Given a list of `SettingRow`s, returns a flat `{ key: value }` map of the
**latest** row per key that is effective on or before `asOf`.

```
for row in rows:
  if row.effectiveFrom is null or row.effectiveFrom <= asOf:
    map[row.key] = row.value     // later rows overwrite earlier ones
```

This is the function that makes "rates that took effect on 2024-07-01
apply to the August 2024 pay run" work correctly.

### 4.14 `getWorkingDaysInMonth(year, month)`

Counts Monday–Friday in the given (1-indexed) `month`. Used by the
payroll route to compute `workingDaysInPeriod` for overtime.

> **Known simplification** — does not subtract Malawi public holidays. See
> [`IMPROVEMENTS.md`](./IMPROVEMENTS.md#7).

### 4.15 `validatePayrollInput(input)`

Returns a `string[]` of validation errors. Used by the API layer to
short-circuit obvious mistakes (negative hours, zero salary) before any
calculation runs. `ZodError` from the route handler is a separate,
richer check.

---

## 5. Worked Example

Using the README's high-earner example (engine's own test case):

```
Basic salary       : 1,650,000 MWK
Allowances         :   200,000 MWK
Bonuses            :   100,000 MWK
Other earnings     :         0 MWK
Overtime (normal)  :    10 hours
```

**Step 1 — Overtime**

```
hourlyRate = 1,650,000 / 22 / 8  ≈  9,375.00 MWK
overtimePay = 10 × 1.5 × 9,375   = 140,625 MWK
```

**Step 2 — Gross**

```
grossEarnings = 1,650,000 + 200,000 + 140,625 + 100,000 + 0
              = 2,090,625 MWK
```

**Step 3 — PAYE** (band 3, since 2,090,625 ∈ [1,570,001, 10,000,000])

```
excess = 2,090,625 - 1,570,000 = 520,625
tax    = 420,000 + 520,625 × 35% = 420,000 + 182,218.75
       = 602,218.75 → round → 602,219 MWK
```

**Step 4 — Pension**

```
pensionableIncome = min(2,090,625, 1,000,000) = 1,000,000 MWK
pensionEE = 1,000,000 × 5%  = 50,000 MWK
pensionER = 1,000,000 × 10% = 100,000 MWK
```

**Step 5 — TEVET**

```
tevetLevy = 2,090,625 × 1% = 20,906.25 → 20,906 MWK
```

**Step 6 — Totals**

```
totalDeductions = 602,219 + 50,000 + 0   (otherDeductions = 0) = 652,219 MWK
netPay          = 2,090,625 - 652,219                       = 1,438,406 MWK
employerCost    = 2,090,625 + 100,000 + 20,906             = 2,211,531 MWK
```

That exact computation is one of the test cases in
`src/lib/payroll-engine.test.ts`.

---

## 6. Where the Engine Is Used

| Caller | How it uses the engine |
| --- | --- |
| `src/app/api/payroll/route.ts` (`POST`) | Loads `Settings`, calls `buildStatutoryConfigFromSettings`, then `calculatePayroll` for every active employee, then bulk-creates `PayrollRecord`s with the `configSnapshot` JSON. |
| `src/app/api/payroll/calculate/route.ts` (`POST`) | Same pattern, but stateless — returns the breakdown to the client for the live preview. |
| `src/app/payroll/page.tsx` | Duplicates `calculateOvertimePay` locally to avoid the round-trip for the live preview. **Should import from the engine** — see IMPROVEMENTS. |
| `src/app/settings/page.tsx` | Duplicates a small PAYE preview (`bandPreviewTax`) for the live PAYE band editor. **Should import from the engine** — see IMPROVEMENTS. |
| `src/lib/payroll-engine.test.ts` | Vitest unit tests — every public function has at least one test. |
| `src/lib/fbt-engine.ts` | Fringe Benefits Tax module — classification, valuation rules, and `calculateEmployerFBT` aggregation. Called from `calculatePayroll` when `fringeBenefits` are present. |
| `src/lib/fbt-engine.test.ts` | Vitest unit tests for the FBT engine — 15+ test cases. |

---

## 7. Testing the Engine

```bash
npm run test          # all tests, CI mode
npx vitest watch      # interactive
```

The test file covers:

- `calculatePAYE` boundaries: 0, 170,000, 170,001, 1,570,000, 1,570,001,
  10,000,000, 10,000,001, mid-range values.
- Pension 5 % / 10 % with and without cap.
- TEVET 1 %.
- Overtime: all zero, normal only, holiday only, off-day only, combined,
  with a custom `workingDaysInPeriod`.
- Full `calculatePayroll` integration (the example above).
- `selectEffectiveSettings` with date-effective selection, null
  `effectiveFrom`, and rows in the future.
- `buildStatutoryConfigFromSettings` with defaults, partial overrides,
  custom band counts, and cumulative-tax re-derivation.
- `Number()`-coercion guards (passing strings simulates Prisma Decimal
  arriving over JSON).
