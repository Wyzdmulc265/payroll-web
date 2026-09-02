# Implement Fringe Benefit Tax (FBT) in WizTech Payroll Web

**Type:** feature
**Date:** 2026-09-01
**Author(s):** AI assistant (Kilo)
**Related issue/PR:** none

---

## 1. Goal

Close the FBT gap identified in `docs/changes/2026-09-01-fringe-benefit-tax-audit.md`:
FBT is declared and configurable but never calculated or shown anywhere. After
this change, an operator can enter per-employee fringe-benefit amounts per
period, see the computed FBT on the payroll register, payslip, dashboard, and
reports, and the amount is correctly added to `employerCost` (not employee
`totalDeductions`).

The implementation follows the legal and architectural rules in
`docs/FRINGE-BENEFIT-TAX-PROMPT.md`: FBT is a separate employer-liability
module, not a payroll deduction; benefit types are explicitly classified;
valuation rules are configuration-driven and effective-date aware; every
calculation produces an auditable breakdown; and money-safe arithmetic is used
throughout.

---

## 2. Decisions

| Decision | Chosen approach | Rationale |
|----------|----------------|-----------|
| Module boundary | **Separate `src/lib/fbt-engine.ts`** — not folded into `payroll-engine.ts` | The prompt requires FBT to be logically separate from employee PAYE/net-pay. A separate module enforces the boundary and makes the FBT rules engine testable in isolation. |
| Schema shape | **Child table** `FringeBenefit` (one row per benefit entry per period) | MRA FBT returns require benefit-type breakdown. A flat column loses this detail and forces a later migration. |
| FBT tax liability | **Employer-side** — added to `employerCost`, not `totalDeductions` | Malawian FBT is a withholding tax on the *employer* for non-cash benefits. It is not deducted from employee net pay. |
| Where to enter the base | **Payroll page** (`src/app/payroll/page.tsx`), per-employee per-period | FBT base varies by employee and by period. The employee master record is not the right place. |
| Money arithmetic | **`Decimal.js`** (or `big.js`) for all FBT math; `Math.round` only at the final MWK output | Prevents floating-point drift in intermediate calculations. The existing payroll engine uses `Math.round`; FBT uses the same final rounding policy but guards intermediates. |
| Rate configuration | **`Settings` table** key `statutory.fringe_benefit_tax_rate` (already seeded at 30%) | Reuses the existing effective-dating mechanism. The prompt requires no hard-coded rates. |
| Rules configuration | **New `FBTBenefitType` enum + typed rule interfaces** in `fbt-engine.ts`; no DB table for rules in v1 | The prompt requires a configuration-driven rules engine. Benefit types are hard-coded to an enum for v1; rules are selectable by type + effective date. |
| Scope of this plan | FBT calculation, persistence, UI on payroll/payslip/settings, dashboard KPI, statutory reports, tests, docs | FBT benefit-type CRUD in Settings, employee-level default benefits, and full quarterly MRA return export are deferred. |

---

## 3. Schema changes

File: `prisma/schema.prisma`

### 3.1 New `FringeBenefit` model

```prisma
model FringeBenefit {
  id              String    @id @default(cuid())
  payrollRecordId String    @map("payroll_record_id")
  payrollRecord   PayrollRecord @relation(fields: [payrollRecordId], references: [id], onDelete: Cascade)

  type            String    // HOUSING | VEHICLE | LOAN | SCHOOL | HEALTH | DOMESTIC | OTHER
  description     String?   // free-text detail (e.g. "3-bedroom house, Area 10")
  amount          Decimal   @db.Decimal(15, 2)
  taxableValue    Decimal   @db.Decimal(15, 2) @default(0) @map("taxable_value")

  createdAt       DateTime  @default(now()) @map("created_at")

  @@map("fringe_benefits")
  @@index([payrollRecordId])
}
```

Add the inverse relation on `PayrollRecord`:

```prisma
fringeBenefits FringeBenefit[]
```

### 3.2 Add two columns to `PayrollRecord`

```prisma
fringeBenefitBase Decimal   @db.Decimal(15, 2) @default(0) @map("fringe_benefit_base")
fringeBenefitTax  Decimal   @db.Decimal(15, 2) @default(0) @map("fringe_benefit_tax")
```

### 3.3 Migration notes

- New migration is additive only; no existing data to backfill.
- `PayrollRecord.fringeBenefitBase` and `fringeBenefitTax` default to `0`, so
  existing rows are unaffected.
- `configSnapshot` shape changes at `payroll/route.ts:142` — add
  `fringeBenefitTaxRate` to the frozen JSON.

---

## 4. Engine architecture

Create a new file `src/lib/fbt-engine.ts`. The payroll engine
(`payroll-engine.ts`) remains untouched except for calling into this module
from `calculatePayroll`.

### 4.1 Types and enums

```ts
export enum FringeBenefitType {
  HOUSING_EMPLOYER_OWNED = 'HOUSING_EMPLOYER_OWNED',
  HOUSING_RENTED = 'HOUSING_RENTED',
  MOTOR_VEHICLE = 'MOTOR_VEHICLE',
  SCHOOL_FEES = 'SCHOOL_FEES',
  UTILITIES = 'UTILITIES',
  HOUSEHOLD_ITEMS = 'HOUSEHOLD_ITEMS',
  VACATION = 'VACATION',
  TRAVEL = 'TRAVEL',
  DOMESTIC_SERVICE = 'DOMESTIC_SERVICE',
  AIRTIME_DATA = 'AIRTIME_DATA',
  CONCESSIONARY_LOAN = 'CONCESSIONARY_LOAN',
  OTHER_BENEFIT = 'OTHER_BENEFIT',
}

export enum BenefitPaymentMethod {
  DIRECT_TO_INSTITUTION = 'DIRECT_TO_INSTITUTION',
  CASH_TO_EMPLOYEE = 'CASH_TO_EMPLOYEE',
  ADVANCE = 'ADVANCE',
}

export interface FringeBenefitInput {
  type: FringeBenefitType;
  description?: string;
  paymentMethod?: BenefitPaymentMethod;
  amount: number;            // original benefit value / employer cost
  employeeContribution?: number;
  effectiveFrom: Date;       // benefit period start
  effectiveTo?: Date;        // benefit period end

  // Category-specific fields
  originalCost?: number;     // MOTOR_VEHICLE
  furnished?: boolean;       // HOUSING_*
  ownershipType?: 'EMPLOYER_OWNED' | 'RENTED'; // HOUSING_*
  employerRentalCost?: number; // HOUSING_RENTED
  openMarketRentalValue?: number; // HOUSING_RENTED
  benchmarkInterestRate?: number; // CONCESSIONARY_LOAN
  employerInterestRate?: number;  // CONCESSIONARY_LOAN
  principalAmount?: number;       // CONCESSIONARY_LOAN
}

export interface BenefitValuationResult {
  input: FringeBenefitInput;
  classification: 'FBT' | 'PAYE_NOT_FBT' | 'EXCLUDED';
  classificationReason?: string;
  candidateValues: Record<string, number>;
  selectedTaxableValue: number;
  reductionApplied?: number;
  ruleUsed: string;
  ruleEffectiveFrom: Date;
  auditTrail: AuditEntry[];
}

export interface AuditEntry {
  rule: string;
  source: string;
  effectiveFrom: Date;
  formula: string;
  inputs: Record<string, unknown>;
  result: number;
}

export interface FBTResult {
  employeeId: string;
  payrollPeriod: string;
  benefits: BenefitValuationResult[];
  totalTaxableValue: number;
  fbtRate: number;
  fringeBenefitsTax: number;
  liabilityType: 'EMPLOYER';
}
```

### 4.2 Classification logic

Cash benefits (cash allowance, cash bonus, cash housing allowance, cash
transport allowance) are **not** FBT. They are classified as `PAYE_NOT_FBT`
with reason `"Benefit paid in cash — falls under normal employment income"`.

Excluded items (medical facilities, housing advances, funeral advances,
medical advances, school fees advances) are classified as `EXCLUDED` with
reason `"Excluded category under applicable MRA guidance"`.

The system must distinguish between:
- `School fees paid directly by employer to institution` → FBT (50% rule)
- `School fees advance or loan provided to employee` → EXCLUDED

### 4.3 Valuation rules (configuration-driven, effective-date aware)

Each rule implements:

```ts
interface FringeBenefitValuationRule {
  benefitType: FringeBenefitType;
  effectiveFrom: Date;
  effectiveTo?: Date;
  calculate(input: FringeBenefitInput, context: TaxContext): BenefitValuationResult;
}
```

v1 rules:

| Type | Rule | Effective from | Source |
|------|------|----------------|--------|
| `MOTOR_VEHICLE` | `taxableValue = originalCost × 15%` | 2024-04-01 | MRA FBT guidelines |
| `HOUSING_EMPLOYER_OWNED` (unfurnished) | `10% × employee basicSalary` | 2024-04-01 | MRA FBT guidelines |
| `HOUSING_EMPLOYER_OWNED` (furnished) | `12% × employee basicSalary` | 2024-04-01 | MRA FBT guidelines |
| `HOUSING_RENTED` | `employerRentalCost` (capped at openMarketRentalValue) | 2024-04-01 | MRA FBT guidelines |
| `SCHOOL_FEES` (direct to institution) | `amount × 50%` | 2024-04-01 | MRA FBT guidelines |
| `SCHOOL_FEES` (cash/advance) | EXCLUDED | — | MRA FBT guidelines |
| `AIRTIME_DATA` | `amount × 50%` | 2024-04-01 | 2024 Amendment Regulations |
| `AIRTIME_DATA` (pre-2024) | `amount × 100%` | before 2024-04-01 | prior rules |
| `UTILITIES`, `HOUSEHOLD_ITEMS`, `VACATION`, `TRAVEL`, `DOMESTIC_SERVICE` | `employerCost` | 2024-04-01 | MRA FBT guidelines |
| `CONCESSIONARY_LOAN` | `principal × (benchmarkRate − employerRate) × periodFraction` | 2024-04-01 | MRA FBT guidelines |
| `OTHER_BENEFIT` | `employerCost` | 2024-04-01 | MRA FBT guidelines |

The rules engine selects the applicable rule by `benefitType + benefit date`.
Historical calculations must never silently apply the latest rule; if no rule
is found for the given effective date, the engine throws
`TaxRuleNotFoundError`.

### 4.4 Employee contributions

Where an employee makes a qualifying contribution:

```ts
taxableValue = Math.max(0, grossTaxableValue - employeeContribution);
```

The gross value and contribution are stored separately in the audit trail.

### 4.5 Aggregation

```ts
export function calculateEmployerFBT(
  benefits: FringeBenefitInput[],
  config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): FBTResult {
  // 1. Classify each benefit
  // 2. Apply the applicable valuation rule
  // 3. Sum totalTaxableValue across FBT-classified benefits
  // 4. fringeBenefitsTax = round(totalTaxableValue × fbtRate / 100)
  // 5. Return FBTResult with per-benefit auditTrail
}
```

`fringeBenefitsTax` is added to `employerCost` by `calculatePayroll`.
`totalDeductions` and `netPay` are unchanged.

### 4.6 Money-safe arithmetic

All intermediate calculations in `fbt-engine.ts` use `Decimal` (from
`decimal.js` or equivalent). Final output is rounded to MWK integer via
`Math.round`. The engine never stores or returns fractional tambala.

### 4.7 Integration with `calculatePayroll`

In `src/lib/payroll-engine.ts`:

```ts
// In calculatePayroll:
const fbtResult = calculateEmployerFBT(input.fringeBenefits ?? [], config);
const employerCost = calculateEmployerCost(grossEarnings, pensionER, tevetLevy)
  + fbtResult.fringeBenefitsTax;
```

`PayrollInput` gains:

```ts
fringeBenefits?: FringeBenefitInput[];
```

`PayrollResult` gains:

```ts
fringeBenefitBase: number;   // sum of all FBT-classified taxable values
fringeBenefitTax: number;    // employer FBT liability
fbtResult: FBTResult;        // full audit trail
```

---

## 5. API route changes

### 5.1 `src/app/api/payroll/route.ts` (POST — run payroll)

- Zod schema `runPayrollSchema`: add `fringeBenefitData` array
  (`{ employeeId, benefits: FringeBenefitInput[] }`).
- For each employee, call `calculateEmployerFBT(benefits, config)` to get
  `fbtResult`.
- Persist `FringeBenefit` rows (one per benefit entry) via
  `prisma.fringeBenefit.createMany` inside the existing `$transaction`.
- Persist `fringeBenefitBase` (= `fbtResult.totalTaxableValue`) and
  `fringeBenefitTax` on the `PayrollRecord`.
- Store the full `fbtResult` JSON in a new `PayrollRecord.fbtSnapshot Json?`
  column (or embed in the existing `configSnapshot`). **Recommendation: new
  column** so the audit trail is queryable without parsing the config blob.
- Add `fringeBenefitTaxRate` to the `configSnapshot` JSON.

### 5.2 `src/app/api/payroll/calculate/route.ts` (POST — preview)

- Accept `fringeBenefits: z.array(fringeBenefitInputSchema).optional()`.
- Pass to `calculateEmployerFBT`.
- Return `fringeBenefitBase`, `fringeBenefitTax`, and `fbtResult` in the
  JSON response.

### 5.3 `src/app/api/payslips/[id]/route.ts`

- Include `fringeBenefitBase`, `fringeBenefitTax`, and a **summarized**
  `fbtResult` (per-type breakdown, not full audit trail) in the payslip payload.
- Add formatted entries for both in the `formatted` object.

### 5.4 `src/app/api/dashboard/route.ts`

- Add `totalFBT` accumulator in the KPIs section.
- Format it with `config.currency`.
- Add `fbt` to each department object in `payrollByDepartment`.

### 5.5 `src/app/api/reports/route.ts`

- **Statutory Summary**: add `Total FBT` column.
- **Payroll Register, Department Payroll**: add `Fringe Benefit Base` and `FBT` columns.
- **New report type**: `Fringe Benefit Schedule` — one row per benefit entry
  with employee, type, description, amount, taxable value, FBT rate, FBT
  amount. This is what the payroll officer uses for MRA compliance.

### 5.6 New: `src/app/api/fbt/route.ts` (GET — quarterly summary)

```ts
GET /api/fbt?period=2026-08&employeeId=EMP001
```

Returns the `FBTResult` for a given employee and period, including the full
per-benefit audit trail. This is the data source for the MRA quarterly return.

---

## 6. UI changes

### 6.1 `src/app/payroll/page.tsx`

- Add `fringeBenefits: FringeBenefitInput[]` to `PayrollRow`.
- Replace the single "Fringe Benefit Base" input with a **benefit-entry sub-form**:
  - Dropdown to select benefit type (from `FringeBenefitType` enum).
  - Dynamic fields based on type (e.g. `originalCost` for vehicle,
    `furnished` checkbox for housing, `paymentMethod` for school fees).
  - Free-text description.
  - Amount input.
  - Employee contribution input (if applicable).
  - "Add benefit" / "Remove" buttons.
- The sub-form calls `/api/payroll/calculate` with the benefits array and
  displays the computed FBT live.
- Helper text: "Enter non-cash benefits for this employee. Cash benefits
  (allowances, bonuses) are taxed under PAYE, not FBT."

### 6.2 `src/app/payslips/page.tsx`

- Add `fringeBenefitBase`, `fringeBenefitTax`, and `fbtSummary` to
  `PayslipData`.
- In the **Employer Contributions** section, add a new subsection
  **"Employer FBT"** (between TEVET Levy and Total Employer Cost):

  ```
  Fringe Benefit Taxable Base    MWK X,XXX
  Fringe Benefit Tax (X%)        MWK X,XXX
  ```

- Show a per-type breakdown (e.g. "Housing: MWK 200,000 taxable value").
- `fbtResult.benefits` provides the breakdown.

### 6.3 `src/app/settings/page.tsx`

- No structural change needed — the FBT rate input already exists at line 96.
- Add a small inline note: "Effective rate applied to fringe-benefit taxable
  base. Defaults to 30% if not set. Source: Malawi Taxation Act."
- Ensure the value falls back to `config.fringeBenefitTaxRate ?? 30` when
  the settings row is absent.

### 6.4 `src/app/dashboard/page.tsx`

- Add a `Total FBT` KPI card.
- No chart changes required for v1.

---

## 7. Tests

File: `src/lib/fbt-engine.test.ts` (new file)

### 7.1 Classification tests

- Cash transport allowance → `PAYE_NOT_FBT`
- Cash housing allowance → `PAYE_NOT_FBT`
- School fees advance → `EXCLUDED`
- School fees direct to institution → `FBT`

### 7.2 Motor vehicle tests

- Standard: `originalCost = 30,000,000` → `taxableValue = 4,500,000`
- Missing original cost → validation error
- Historical rule selection (if multiple rules exist)

### 7.3 Housing tests

- Employer-owned unfurnished: `10% × salary`
- Employer-owned furnished: `12% × salary`
- Rented: `employerRentalCost` capped at `openMarketRentalValue`
- Employee contribution reduces taxable value (not below 0)
- Invalid inputs

### 7.4 School fees tests

- Direct payment to institution: `50% × amount`
- Cash payment: `EXCLUDED`
- Advance: `EXCLUDED`

### 7.5 Airtime/data tests

- Before 2024-04-01: `100%`
- On/after 2024-04-01: `50%`

### 7.6 Concessionary loan tests

- `principal × (benchmarkRate − employerRate) × periodFraction`

### 7.7 Aggregation tests

- Multiple benefits for one employee → correct total taxable value
- FBT = `totalTaxableValue × rate / 100`, rounded
- FBT never reduces employee net pay
- Cash benefits classified for PAYE are not also subjected to FBT

### 7.8 Quarterly aggregation tests

- Sum across employees for a quarter
- Group by benefit type

File: `src/lib/payroll-engine.test.ts` (extend)

- `calculatePayroll` integration with `fringeBenefits` array
- Assert `fringeBenefitTax` lands in `employerCost` and **not** in
  `totalDeductions`
- Assert `netPay` is unchanged when `fringeBenefits` is present
- `buildStatutoryConfigFromSettings` overrides `fringeBenefitTaxRate`

---

## 8. Order of execution (for the implementing agent)

1. **Prisma migration** — add `FringeBenefit` model + two `PayrollRecord` columns + `fbtSnapshot`. Run migration.
2. **FBT engine** — create `src/lib/fbt-engine.ts` with types, classification, rules, aggregation. Write tests first (TDD).
3. **Payroll engine integration** — update `PayrollInput`, `PayrollResult`, `calculatePayroll` in `payroll-engine.ts`.
4. **API routes** — update Zod schemas and handlers in payroll, calculate, payslips, dashboard, reports. Add new `/api/fbt` route.
5. **UI payroll page** — benefit-entry sub-form with dynamic fields by type. Verify live recalculation.
6. **UI payslip page** — Employer FBT section with per-type breakdown.
7. **UI settings page** — cosmetic fallback text.
8. **Dashboard + Reports API** — add FBT to KPIs and reports.
9. **Tests** — run full suite (`npm test`). All existing + new tests pass.
10. **Docs** — see §13.

---

## 9. Validation plan

- `npm run test` — all existing tests pass; 15+ new FBT tests pass.
- `npm run lint` — no new warnings.
- `npm run build` — no type errors.
- Manual: enter a motor vehicle benefit (`originalCost = 30,000,000`),
  verify taxable value = `4,500,000`, FBT = `1,350,000` at 30%.
- Manual: enter school fees paid directly (`amount = 4,000,000`),
  verify taxable value = `2,000,000`, FBT = `600,000`.
- Manual: enter school fees as advance, verify classified as `EXCLUDED` and
  FBT = 0.
- Manual: enter airtime/data before 2024-04-01, verify 100%; after, verify 50%.
- Manual: run payroll, verify `employerCost` includes FBT and `netPay` is
  unchanged.
- Manual: open payslip, verify Employer FBT section with per-type breakdown.
- Manual: change `statutory.fringe_benefit_tax_rate` to `25`, rerun, verify
  FBT drops proportionally.
- Manual: Statutory Summary and Fringe Benefit Schedule reports render correctly.
- Regression: confirm TEVET, Pension ER, PAYE, net pay identical to pre-change
  runs when `fringeBenefits` is empty.

---

## 10. Out of scope (deferred)

- **Employee-level default benefit amounts** — deferred to follow-up.
- **Benefit-type CRUD in Settings** — types are hard-coded enum for v1.
- **FBT exemption logic** — `Employee.taxStatus` is a dead field today
  (`docs/IMPROVEMENTS.md#11`). FBT exemption rules are not wired.
- **PDF generation** — existing "Export PDF" uses `window.print()`.
- **Authentication / authorization** — all API routes remain public until
  `next-auth` is wired (`docs/IMPROVEMENTS.md#1`).
- **Quarterly MRA return submission** — the report data is prepared but not
  auto-submitted.
- **Concessionary loan amortization schedule** — v1 uses a simplified
  period-fraction calculation; full outstanding-balance history is deferred.

---

## 11. Risks

- **Migration ordering**: `FringeBenefit` depends on `PayrollRecord.id`. The
  migration runs after `20260901030658_init`; no ordering risk.
- **Decimal precision**: FBT engine uses `Decimal.js` for intermediates;
  `Math.round` at final output. `Number()` coercion at API boundary is
  preserved.
- **configSnapshot / fbtSnapshot**: if the new `fbtSnapshot` column is not
  populated, historical FBT calculations cannot be reproduced. This plan
  includes it explicitly.
- **Effective-date rule selection**: if a benefit has no matching rule for its
  effective date, the engine throws `TaxRuleNotFoundError` rather than
  silently applying the latest rule. The UI must surface this clearly.
- **Large benefit arrays**: `calculateEmployerFBT` is O(n) in the number of
  benefits. For v1 (dozens of benefits per employee), this is negligible.
  If benefit counts grow to thousands, consider batching.

---

## 12. Documentation requirements (per `docs/AI-DOCUMENTATION-INSTRUCTIONS.md`)

Every change must be accompanied by a single Markdown file in `docs/changes/`
or `docs/bugsfix/`. For this feature, the implementing agent **must** create:

### 12.1 `docs/changes/2026-MM-DD-implement-fringe-benefit-tax.md`

Required sections (from `docs/AI-DOCUMENTATION-INSTRUCTIONS.md` §3):

1. **Why** — reference the audit file `docs/changes/2026-09-01-fringe-benefit-tax-audit.md` and the prompt file `docs/FRINGE-BENEFIT-TAX-PROMPT.md`.
2. **What changed** — bullet list from the consumer's point of view.
3. **How it works** — files added/modified, functions added, code snippets for
   non-obvious logic (especially the rules engine and classification logic).
4. **What got better** — tie to the qualities in `docs/README.md`: statutorily
   correct, historically reproducible, decimal-safe, auditable, type-safe.
5. **Risks and trade-offs** — migration ordering, Decimal.js dependency,
   effective-date rule selection failure mode.
6. **Test plan** — list new test files and what they cover.
7. **Follow-ups** — deferred items from §10 above, cross-reference
   `docs/IMPROVEMENTS.md` entries.

### 12.2 Updated reference docs

The change file is a commitment that the following docs are also updated
(`docs/AI-DOCUMENTATION-INSTRUCTIONS.md` §5.5):

| Doc | Required update |
|-----|-----------------|
| `docs/ENGINE.md` | Add `src/lib/fbt-engine.ts` to the engine inventory (§6). Add a new section documenting `calculateEmployerFBT`, `FringeBenefitType`, `BenefitValuationResult`, and the rules engine. Update `StatutoryConfig` table to note `fringeBenefitTaxRate` is now consumed. |
| `docs/DATABASE.md` | Add `FringeBenefit` model under §2. Add `fringeBenefitBase`, `fringeBenefitTax`, `fbtSnapshot` columns to `PayrollRecord` under §3. Add `statutory.fringe_benefit_tax_rate` under §5 with a note that it is now active. |
| `docs/API.md` | Document new/changed endpoints: `POST /api/payroll` (`fringeBenefitData`), `POST /api/payroll/calculate` (`fringeBenefits`), `GET /api/payslips/[id]` (FBT payload fields), `GET /api/fbt` (new). |
| `docs/UI.md` | Document the new benefit-entry sub-form on the payroll page, the Employer FBT section on the payslip, and the Total FBT KPI on the dashboard. |
| `docs/FRINGE-BENEFIT-TAX-PROMPT.md` | No changes — this is the source spec. |

### 12.3 Cross-linking

The change file must link to:
- `docs/changes/2026-09-01-fringe-benefit-tax-audit.md` (the audit that triggered this work)
- `docs/FRINGE-BENEFIT-TAX-PROMPT.md` (the legal/architectural spec)
- Any `docs/IMPROVEMENTS.md` entries addressed (add an FBT entry if one is added in the same change)

---

## 13. Exact file manifest (implementing agent checklist)

```
prisma/schema.prisma              add FringeBenefit model + 2 PayrollRecord columns + fbtSnapshot
prisma/migrations/...             new migration
src/lib/fbt-engine.ts             NEW — types, classification, rules, aggregation, audit trail
src/lib/payroll-engine.ts         update PayrollInput/PayrollResult/calculatePayroll
src/app/api/payroll/route.ts      Zod + handler + createMany + fbtSnapshot
src/app/api/payroll/calculate/route.ts  Zod + handler
src/app/api/payslips/[id]/route.ts      payload + formatted + fbtSummary
src/app/api/dashboard/route.ts  KPIs + charts
src/app/api/reports/route.ts     headers + aggregate + new report type
src/app/api/fbt/route.ts         NEW — quarterly per-employee FBT detail
src/app/payroll/page.tsx         benefit-entry sub-form + tooltip
src/app/payslips/page.tsx        Employer FBT section + formatted fields
src/app/settings/page.tsx        cosmetic fallback text
src/lib/pbt-engine.test.ts       NEW — 15+ test cases per §7
src/lib/payroll-engine.test.ts   extend with FBT integration cases
docs/ENGINE.md                   new section for fbt-engine + snapshot note
docs/DATABASE.md                 new model + columns + key note
docs/API.md                      new/changed endpoint fields
docs/UI.md                       new section
docs/changes/2026-MM-DD-implement-fringe-benefit-tax.md  REQUIRED
```
