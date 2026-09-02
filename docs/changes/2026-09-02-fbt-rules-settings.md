# Make FBT benefit rules configurable via Settings

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

FBT valuation rules were hardcoded in `src/lib/fbt-engine.ts` (e.g. motor
vehicle = 15% of original cost, housing = 10–12% of salary, etc.). Any
rate or rule change required a code change, a redeploy, and a developer
who knew the engine. The Malawi statutory environment is not static:
MRA can update percentages, add effective dates, or exclude benefit
types. We needed a way for an administrator to configure those rules
from the Settings page without touching code.

## 2. What changed

- `src/lib/fbt-engine.ts`: FBT rules can now be loaded from the
  `Settings` table and applied at runtime.
- `src/app/settings/page.tsx`: STATUTORY tab now shows an **FBT
  Benefit Rules** table and supports add/edit/delete via the existing
  Advanced modal.
- `src/lib/payroll-engine.ts`: `calculatePayroll` now accepts an
  optional `settingsMap` and forwards it to FBT calculation.
- `src/app/api/payroll/route.ts` and
  `src/app/api/payroll/calculate/route.ts`: both pass the effective
  settings map into the engine.
- `src/lib/fbt-engine.test.ts`: added 18 unit tests covering rule
  loading, effective-date selection, every supported rule type,
  classification handling, fallback to hardcoded rules, and payroll
  integration.

## 3. How it works

### 3.1 Storage format

FBT rules live in the existing `settings` table as JSON values. Keys
follow a structured pattern:

```
statutory.fbt_rule_<benefitType>_<version>_<effectiveFromDate>
```

Example:
```
statutory.fbt_rule_MOTOR_VEHICLE_v1_2026-01-01
```

The value is a JSON object:

```json
{
  "benefitType": "MOTOR_VEHICLE",
  "version": "v1",
  "effectiveFrom": "2026-01-01",
  "effectiveTo": "2026-12-31",
  "valuationRule": {
    "type": "PERCENTAGE_OF_COST",
    "parameters": { "percentage": 12 }
  },
  "classification": "FBT"
}
```

### 3.2 Engine changes

New helper functions in `src/lib/fbt-engine.ts`:

```ts
export function loadFbtRulesFromSettings(settingsMap: Record<string, string>): FbtRule[];
export function findApplicableFbtRule(
  rules: FbtRule[],
  benefitType: FringeBenefitType,
  effectiveDate: Date
): FbtRule | null;
export function applyFbtRule(rule: FbtRule, input: FringeBenefitInput): BenefitValuationResult;
```

`calculateBenefitValue(input, settingsMap?)` was extended with an
optional `settingsMap`. If a matching configured rule exists, it is
used; otherwise the engine falls back to the original hardcoded switch
statement. `calculateEmployerFBT` likewise accepts an optional
`settingsMap` and forwards it.

### 3.3 Settings UI

The STATUTORY tab now contains an **FBT Benefit Rules** section. It
renders rules extracted from `settingsMap` and provides an **Add FBT
Rule** button that opens the same Advanced modal used by the raw
settings table. Because rules are stored as settings, no database
migration was required.

### 3.4 Supported rule types

| Type | Meaning | Required input fields |
| --- | --- | --- |
| `PERCENTAGE_OF_COST` | `originalCost × percentage` | `originalCost` |
| `PERCENTAGE_OF_SALARY` | `amount × percentage` | `amount` |
| `FIXED_PERCENTAGE` | `amount × percentage` | `amount` |
| `EMPLOYER_COST` | Full `amount` | `amount` |
| `CONCESSIONARY_LOAN` | `principal × (benchmarkRate − employerRate) × periodFraction` | `principalAmount`, `benchmarkInterestRate`, `employerInterestRate` |
| `CAPPED_RENTAL` | `MIN(employerRentalCost, openMarketRentalValue)` | `employerRentalCost`, `openMarketRentalValue` |

Supported classifications:
`FBT`, `PAYE_NOT_FBT`, `EXCLUDED`.

## 4. What got better

- **Configurability**: administrators can now change motor-vehicle
  rates, add new benefit-type rules, or retire old ones without a
  code change.
- **Auditability**: configured rules appear in the FBT audit trail
  with their version and effective-from date, replacing anonymous
  hardcoded rule names.
- **Backward compatibility**: when no rules are stored in settings,
  the engine behaves exactly as before. Existing payroll records are
  unaffected.
- **Type safety**: new `FbtRule`, `FbtRuleType`, and `FbtClassification`
  types make invalid configurations unrepresentable at compile time.

## 5. Risks and trade-offs

- **Rule validation is lenient**: malformed JSON or missing required
  fields are silently skipped with a `console.warn`. A future
  improvement could add stricter validation in the API layer.
- **No effective-date overlap guard**: the engine picks the most
  recently effective rule for a given date, but the UI does not
  prevent overlapping date ranges. Administrators must manage this
  manually for now.
- **Performance**: loading FBT rules is O(N) over settings. With the
  current scale (a handful of rules) this is negligible; if the
  settings table grows large, caching will be needed.

## 6. Test plan

- `npx tsc --noEmit` — passes with zero errors.
- `npx vitest run` — 63/63 tests pass, including 18 new FBT rules
  engine tests.
- Manual verification steps from the plan:
  1. Configure `MOTOR_VEHICLE` at 12% via Settings → STATUTORY.
  2. Run payroll and confirm the taxable value drops from 15% to 12%.
  3. Confirm the audit trail shows `MOTOR_VEHICLE_v1` and
     `"source": "Configured FBT rule"`.
  4. Remove the rule and confirm the engine falls back to the
     hardcoded 15% rule.

## 7. Follow-ups

- Add effective-date overlap validation in the settings UI.
- Surface FBT rule changes in the `AuditLog` with full before/after
  of the rule JSON.
- Consider adding a dedicated `fbt_rules` table if rule volume or
  query complexity grows beyond what a settings-based JSON approach
  can cleanly support.