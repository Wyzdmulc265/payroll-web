You are a senior payroll software engineer and Malawi tax compliance specialist.

Your task is to design and implement a robust, accurate, auditable and maintainable Fringe Benefits Tax (FBT) calculation module for a Malawi payroll application.

The application already has a payroll engine that calculates employee earnings, PAYE, deductions and net pay. The FBT module must integrate with the payroll system but must remain logically separate from the employee's PAYE and net-pay calculations.

## 1. PRIMARY OBJECTIVE

Build a Malawi Fringe Benefits Tax calculation engine that:

* Identifies taxable fringe benefits.
* Determines the taxable value of each benefit.
* Applies the applicable Fringe Benefits Tax rate.
* Calculates the employer's FBT liability.
* Tracks FBT by employee, benefit type, period and employer.
* Supports monthly benefit recording and quarterly FBT reporting.
* Produces an auditable breakdown of every calculation.
* Allows tax rules and rates to be updated without rewriting the calculation engine.
* Does not incorrectly deduct FBT from employee salaries.

The implementation must prioritize legal compliance, accuracy, transparency and future maintainability.

---

# 2. LEGAL FRAMEWORK TO USE

The implementation must be based on the Malawi Taxation Act (Cap. 41:01), including Part IXA dealing with taxation of fringe benefits.

In particular, consider:

## Section 94A – Liability of Employers to Pay Fringe Benefits Tax

The core principle is:

* Every employer, other than the Government, that provides fringe benefits to employees is liable to pay Fringe Benefits Tax.
* The employer pays FBT on the total taxable value of fringe benefits provided.
* The employee should not have FBT deducted from their net salary merely because the employee received the benefit.
* FBT is an employer tax liability and must be kept separate from employee PAYE.

A fringe benefit generally includes an asset, service or other benefit in kind provided by or on behalf of an employer to an employee where the benefit contains an element of personal benefit.

---

# 3. IMPORTANT ARCHITECTURAL RULE

DO NOT include Fringe Benefits Tax as a deduction in the normal payroll calculation.

The architecture should conceptually be:

PAYROLL ENGINE

1. Employee Payroll Calculation

   * Basic salary
   * Cash allowances
   * Overtime
   * Bonuses
   * PAYE
   * Employee deductions
   * Net pay

2. Employer Obligations

   * Employer pension contributions
   * TEVET levy where applicable
   * Fringe Benefits Tax
   * Other employer statutory liabilities

FBT must therefore be calculated in a separate module and returned as an employer liability.

Example result structure:

```typescript
interface FringeBenefitsTaxResult {
  employeeId: string;
  taxPeriod: string;

  benefits: FringeBenefitCalculation[];

  totalTaxableValue: number;

  fbtRate: number;
  fringeBenefitsTax: number;

  liabilityType: "EMPLOYER";

  auditTrail: AuditEntry[];
}
```

The FBT must NOT reduce employee net pay.

---

# 4. CASH BENEFITS VS BENEFITS IN KIND

The system must distinguish between:

A. CASH BENEFITS

Benefits paid directly in cash to the employee should generally not be processed through the FBT engine.

Instead, they should be flagged for treatment under the normal employment income and PAYE rules.

Example:

```text
Cash transport allowance
→ PAYE payroll engine

Cash housing allowance
→ PAYE payroll engine

Cash bonus
→ PAYE payroll engine
```

The FBT engine should either:

* Reject these benefits from FBT calculation; or
* Return a classification result such as:

```typescript
{
  classification: "PAYE_NOT_FBT",
  reason: "Benefit paid in cash"
}
```

The system must not tax the same cash benefit under both PAYE and FBT.

---

# 5. EXCLUDED OR NON-FBT ITEMS

The rules engine must support a classification of benefits that are not treated as fringe benefits under applicable MRA guidance.

These include categories such as:

* Medical facilities.
* Housing advances.
* Funeral advances.
* Medical advances.
* School fees advances.

Do not simply calculate FBT because an expense contains one of these words.

The system must distinguish between:

```text
School fees paid directly by employer
```

and:

```text
School fees advance or loan provided to employee
```

These may have different tax treatment.

The system should therefore use explicit benefit categories and not rely solely on free-text descriptions.

---

# 6. FBT RATE

The current MRA guidance used for this implementation states an FBT rate of 30%.

However, DO NOT hard-code 30% directly throughout the application.

Instead, create a configurable tax rule:

```typescript
interface TaxRateRule {
  taxType: "FRINGE_BENEFITS_TAX";
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  sourceReference: string;
}
```

Example:

```typescript
{
  taxType: "FRINGE_BENEFITS_TAX",
  rate: 0.30,
  effectiveFrom: new Date("YYYY-MM-DD"),
  sourceReference: "Malawi Taxation Act / applicable MRA guidance"
}
```

The system must select the applicable rate based on the tax period.

Future tax amendments must be possible without changing calculation code.

---

# 7. BENEFIT CATEGORIES AND VALUATION RULES

Create a strongly typed benefit category system.

For example:

```typescript
enum FringeBenefitType {
  HOUSING_EMPLOYER_OWNED,
  HOUSING_RENTED,
  MOTOR_VEHICLE,
  SCHOOL_FEES,
  UTILITIES,
  HOUSEHOLD_ITEMS,
  VACATION,
  TRAVEL,
  DOMESTIC_SERVICE,
  AIRTIME_DATA,
  CONCESSIONARY_LOAN,
  OTHER_BENEFIT
}
```

Do not assume all benefits use the same valuation formula.

Each category must have its own valuation rule.

---

# 8. MOTOR VEHICLE BENEFITS

For employer-provided motor vehicles, implement the applicable valuation rule based on the original cost of the vehicle.

The taxable value should be calculated as:

```text
Taxable Value = Original Cost × Applicable Vehicle Percentage
```

The currently referenced rule uses:

```text
15% of the original cost
```

Example:

```text
Original vehicle cost: MWK 30,000,000

Taxable value:
30,000,000 × 15%
= MWK 4,500,000

FBT:
4,500,000 × applicable FBT rate
```

The calculation must store:

* Original cost.
* Acquisition date.
* Benefit period.
* Applicable valuation percentage.
* Taxable value.
* Tax rule source.

Do not use current market value unless a future legal rule specifically requires it.

---

# 9. HOUSING BENEFITS

The system must distinguish between:

A. Housing property owned by the employer.

B. Housing property rented by the employer.

The housing calculation must also distinguish between:

* Furnished accommodation.
* Unfurnished accommodation.

For applicable housing calculations, the engine should support values such as:

```typescript
interface HousingBenefitInput {
  ownershipType: "EMPLOYER_OWNED" | "RENTED";
  furnished: boolean;

  employeeSalary: Money;

  openMarketRentalValue?: Money;
  employerRentalCost?: Money;

  employeeContribution?: Money;

  benefitPeriod: DateRange;
}
```

The applicable valuation rules must be implemented using configurable formulas.

For example, the rules should support percentages such as:

```text
Unfurnished accommodation → 10% of employee salary

Furnished accommodation → 12% of employee salary
```

The system must compare the relevant values required by the applicable regulations and select the required value.

Do not simply assume that 10% or 12% is always the final taxable value without performing the legally required comparison.

The engine must also support applicable reductions or adjustments permitted by the regulations, including a possible 50% reduction where legally applicable.

IMPORTANT:

Do not automatically apply a 50% reduction to every housing benefit.

Represent the reduction as an explicit rule with eligibility criteria.

For every housing calculation, return:

```typescript
{
  inputsUsed: {},
  candidateValues: {},
  selectedValue: {},
  reductionApplied: {},
  finalTaxableValue: {}
}
```

This is necessary for auditability.

---

# 10. SCHOOL FEES

The engine must distinguish between:

A. School fees paid directly by the employer to an educational institution.

B. Cash or advances provided to an employee.

Where the applicable rules provide for a reduced taxable value when school fees are paid directly to an educational institution, the system must apply the correct percentage.

The current rule to support is:

```text
Taxable value = 50% of the cost
```

when the qualifying payment is made directly to the institution.

Example:

```text
School fees paid directly by employer:
MWK 4,000,000

Taxable value:
4,000,000 × 50%
= MWK 2,000,000

FBT:
2,000,000 × applicable FBT rate
```

The input model must therefore include:

```typescript
paymentMethod: "DIRECT_TO_INSTITUTION" | "CASH_TO_EMPLOYEE" | "ADVANCE"
```

Do not apply the 50% school-fee valuation rule to every school-related payment.

---

# 11. UTILITIES AND OTHER EMPLOYER-PROVIDED BENEFITS

The engine should support benefits including:

* Electricity.
* Water.
* Household items.
* Vacations.
* Travel.
* Domestic services.

The system must calculate taxable value according to the applicable legal valuation rule for each category.

Where the rule is based on the cost to the employer:

```text
Taxable Value = Employer Cost
```

The system must record the employer cost and supporting benefit information.

Do not combine all benefits into one generic calculation if different legal exemptions or valuation rules apply.

---

# 12. DOMESTIC SERVICES

Domestic services should support categories including:

* Gardener.
* Maid.
* Cook.
* Nanny.
* Security guard.
* Watchman.

The rules engine must allow different tax treatment depending on:

* The type of domestic service.
* Whether the relevant property is employer-owned.
* Whether an exemption applies under the applicable law.

Do not automatically assume that every domestic employee creates a 100% taxable benefit.

Implement this as a configurable rule.

---

# 13. AIRTIME AND DATA – IMPORTANT 2024 AMENDMENT

The engine must explicitly implement the Taxation (Fringe Benefits Tax) (Information and Payment) (Amendment) Regulations, 2024.

The amendment inserted a specific valuation rule for airtime and data.

The taxable value is:

```text
50% of the value of the airtime or data.
```

The amendment is deemed to have come into operation on:

```text
1 April 2024
```

Therefore, the rules engine must be effective-date aware.

Example:

```text
Airtime/data value:
MWK 1,000,000

Taxable value:
1,000,000 × 50%
= MWK 500,000

FBT:
500,000 × applicable FBT rate
```

The engine must support:

```typescript
effectiveFrom: "2024-04-01"
```

The historical calculation engine should select the correct rule based on the benefit date or tax period.

Do not apply the 2024 airtime/data rule to periods before its legal effective date without confirming the historical rule.

---

# 14. CONCESSIONARY OR EMPLOYEE LOANS

The system should support employee loans provided below the relevant commercial or prescribed interest rate.

The potential taxable benefit may arise from the difference between:

* The applicable commercial interest rate; and
* The interest rate charged to the employee.

The loan calculation module should be separate from simple benefit-cost calculations.

Required inputs should include:

```typescript
interface ConcessionaryLoanInput {
  principalAmount: Money;

  employerInterestRate: number;

  benchmarkInterestRate: number;

  startDate: Date;
  endDate?: Date;

  outstandingBalanceHistory?: BalanceRecord[];
}
```

The calculation must be based on the legally applicable methodology and period.

Do not simply calculate:

```text
Principal × Interest Rate Difference
```

for an entire year unless that matches the actual benefit period and applicable legal rules.

The AI must verify the applicable legal methodology before implementing this category.

---

# 15. EMPLOYEE CONTRIBUTIONS

Where an employee makes a qualifying contribution towards a benefit, the rules engine must support the reduction of the taxable value where legally permitted.

For example:

```text
Gross taxable benefit value
- Employee qualifying contribution
--------------------------------
Adjusted taxable benefit value
```

However:

* Never allow the taxable value to become negative.
* Validate the contribution against the relevant benefit and period.
* Keep the original gross value and employee contribution separately for audit purposes.

Example:

```typescript
taxableValue = Math.max(
  0,
  grossTaxableValue - employeeContribution
);
```

Only apply this reduction where permitted by the relevant benefit valuation rule.

---

# 16. MULTIPLE BENEFITS

The engine must support multiple fringe benefits for one employee.

Example:

```text
Employee A

Housing                MWK X taxable value
Motor vehicle          MWK X taxable value
School fees            MWK X taxable value
Utilities              MWK X taxable value
Airtime and data       MWK X taxable value

--------------------------------
Total Taxable Value    MWK X

× FBT Rate

--------------------------------
Employer FBT Liability MWK X
```

The system must return both:

1. Individual benefit calculations.

2. Aggregated employee FBT liability.

The employer-level module must then aggregate benefits across all employees.

---

# 17. QUARTERLY FBT REPORTING

The implementation must support quarterly reporting.

Design the reporting structure to aggregate taxable values and FBT liabilities by quarter.

The FBT reporting period should be configurable, but the current system should support quarterly instalments and a year ending 31 March.

The reporting engine should support:

```typescript
interface FBTQuarterlyReturn {
  employerId: string;

  taxYear: string;

  quarter: 1 | 2 | 3 | 4;

  housingTaxableValue: Money;

  vehicleTaxableValue: Money;

  otherBenefitsTaxableValue: Money;

  totalTaxableValue: Money;

  fbtRate: number;

  totalFBTPayable: Money;

  dueDate: Date;
}
```

Do not automatically generate or submit tax returns to MRA.

The application should calculate and prepare the data for review and reporting.

---

# 18. AUDITABILITY REQUIREMENT

Every FBT calculation must be explainable.

For every benefit, store:

* Benefit type.
* Employee.
* Benefit date.
* Benefit period.
* Original benefit value.
* Employer cost.
* Employee contribution.
* Taxable value rule used.
* Rule effective date.
* FBT rate used.
* Final FBT.
* Legal source reference.
* Calculation timestamp.

Example:

```typescript
interface AuditEntry {
  rule: string;
  source: string;
  effectiveFrom: Date;

  formula: string;

  inputs: Record<string, unknown>;

  result: number;
}
```

A tax auditor or accountant should be able to understand exactly how every number was calculated.

---

# 19. CONFIGURATION-DRIVEN RULES ENGINE

DO NOT create one massive function containing all tax rules.

Use a strategy or rules-engine architecture.

Example:

```typescript
interface FringeBenefitValuationRule {
  benefitType: FringeBenefitType;

  effectiveFrom: Date;
  effectiveTo?: Date;

  calculate(
    input: FringeBenefitInput,
    context: TaxContext
  ): BenefitValuationResult;
}
```

Possible implementations:

```text
HousingValuationRule
MotorVehicleValuationRule
SchoolFeesValuationRule
UtilitiesValuationRule
AirtimeDataValuationRule
DomesticServicesValuationRule
ConcessionaryLoanValuationRule
```

The system should select the correct rule based on:

```text
Benefit Type
+
Benefit Date
+
Effective Date
```

---

# 20. MONEY AND ROUNDING

Do not use JavaScript floating-point arithmetic directly for tax calculations.

Use a decimal or money-safe library.

For example:

```typescript
Decimal.js
Big.js
```

All monetary calculations must use a consistent rounding policy.

Create a central rounding configuration.

Do not round intermediate values unless legally required.

Store all amounts consistently in either:

* Integer tambala units; or
* A decimal money type.

Document the chosen approach.

---

# 21. VALIDATION

The module must validate:

* Negative monetary amounts.
* Invalid dates.
* Employee contribution greater than benefit value where inappropriate.
* Missing original vehicle cost.
* Missing housing salary data.
* Invalid housing type.
* Invalid payment method.
* Benefit categories that do not match the provided data.
* Tax rules that overlap incorrectly.
* Missing applicable tax rate for a historical period.

Where no applicable rule exists, fail clearly.

Example:

```typescript
throw new TaxRuleNotFoundError(
  "No FBT valuation rule found for AIRTIME_DATA on 2023-01-01"
);
```

Never silently apply the latest rule to historical calculations.

---

# 22. TESTING REQUIREMENTS

Create comprehensive automated tests.

Include:

## Motor Vehicle Tests

* Standard calculation.
* Missing original cost.
* Historical rule selection.
* Multiple vehicles.

## Housing Tests

* Employer-owned furnished.
* Employer-owned unfurnished.
* Rented furnished.
* Rented unfurnished.
* Market value comparison.
* Salary percentage comparison.
* Employee contribution.
* Applicable reduction.
* Invalid inputs.

## School Fees Tests

* Direct payment to institution.
* Cash payment.
* Advance.
* Employee contribution where applicable.

## Airtime and Data Tests

* Before 1 April 2024.
* On 1 April 2024.
* After 1 April 2024.
* Mixed historical periods.

## Aggregation Tests

* Multiple benefits.
* Multiple employees.
* Quarterly aggregation.
* Correct separation between employee net pay and employer FBT.

## Regression Tests

Create tests ensuring that:

```text
FBT never reduces employee net pay.
```

and:

```text
Cash benefits classified for PAYE are not also subjected to FBT.
```

---

# 23. REQUIRED OUTPUT

Produce:

1. A review of the existing payroll engine architecture.

2. A recommended FBT module architecture.

3. TypeScript interfaces and types.

4. Benefit classification logic.

5. Configurable tax-rule definitions.

6. FBT calculation functions.

7. Effective-date rule selection.

8. Employer-level aggregation.

9. Quarterly reporting calculations.

10. Comprehensive unit tests.

11. Clear error handling.

12. Inline comments explaining legal and calculation logic.

13. A README explaining:

* What FBT is.
* Why it is separate from PAYE.
* Supported benefit types.
* Calculation methodology.
* Effective-date rules.
* How future Malawi tax changes can be added.

---

# 24. COMPLIANCE SAFEGUARD

Before implementing or modifying any legal tax rule:

1. Check the latest applicable Malawi Taxation Act.
2. Check amendments affecting Fringe Benefits Tax.
3. Check applicable Fringe Benefits Tax regulations.
4. Check the effective date of every amendment.
5. Prefer official Malawi Revenue Authority and Malawi Government sources.
6. Do not rely solely on outdated consolidated legislation.
7. Do not hard-code a tax rate or valuation percentage without identifying its legal source and effective period.

If the current law is unclear, conflicting or incomplete:

* Flag the rule as requiring legal/accounting review.
* Do not invent a tax treatment.
* Do not silently make assumptions.

The implementation should be designed so that future amendments can be implemented by adding or updating rule records rather than rewriting the entire payroll engine.

The final result must treat Fringe Benefits Tax as an EMPLOYER LIABILITY MODULE integrated with, but logically separate from, the employee payroll and net-pay calculation engine.
