# Database Schema (Prisma)

This document describes the data layer of WizTech Payroll Web, as
defined in `prisma/schema.prisma`. The database is **PostgreSQL**;
access goes through **Prisma 7** with the `@prisma/adapter-pg` driver
adapter.

---

## 1. Overview

Five models — `Employee`, `PayrollRecord`, `FringeBenefit`, `AuditLog`,
`Settings` — cover the entire system. Money is stored as **`Decimal(15, 2)`**;
historical statutory configuration is stored as **`Json`** on each
`PayrollRecord`; soft-delete via `isActive`; audit trail is a separate
append-only table.

The schema is intentionally small. The application derives everything
else (KPIs, charts, reports) at query time.

---

## 1.1. `FringeBenefit` → table `fringe_benefits`

One row per fringe benefit entry per payroll record. MRA FBT returns
require benefit-type breakdown, so this is a child table rather than
flat columns.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `String @id` | `cuid()` | |
| `payrollRecordId` | `String` FK→PayrollRecord | — | Cascade delete. |
| `type` | `String` | — | Benefit type enum value (e.g. `HOUSING_EMPLOYER_OWNED`, `MOTOR_VEHICLE`). |
| `description` | `String?` | — | Free-text detail (e.g. "3-bedroom house, Area 10"). |
| `amount` | `Decimal(15, 2)` | — | Original benefit value / employer cost. |
| `taxableValue` | `Decimal(15, 2)` | `0` | Computed taxable value after applying the valuation rule. |
| `createdAt` | `DateTime` | `now()` | |

**Indexes**: `payrollRecordId`.

---

## 2. `Employee` → table `employees`

The master record. **Soft-deletable** (`isActive`). All historical
`PayrollRecord` rows keep this row alive via `onDelete: Cascade`
*or* `SetNull` depending on the relationship.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `String @id` | `cuid()` | Internal primary key. |
| `employeeId` | `String @unique` | — | The *business* id, regex `^EMP\d{3}$` enforced by Zod. |
| `firstName`, `lastName` | `String` | — | |
| `fullName` | `String?` | — | Denormalised `<first> <last>`; recomputed in API on name change. |
| `nationalId` | `String? @unique` | — | Malawi National ID, optional but unique when present. |
| `employmentStatus` | `String` | `"Active"` | Loose string (`Active` / `Inactive`); the soft-delete target. |
| `department` | `String` | — | Indexed. **Currently the Add-Employee modal hard-codes 5 values**; see IMPROVEMENTS. |
| `position` | `String` | — | |
| `employmentDate` | `DateTime` | — | |
| `employmentType` | `String` | `"Permanent"` | `Permanent` / `Contract`. |
| `basicSalary` | `Decimal(15, 2)` | — | Monthly by default. |
| `salaryFrequency` | `String` | `"Monthly"` | `Monthly` / `Weekly` / `Fortnightly`. **Engine only supports `Monthly`** — `/api/payroll` rejects others. |
| `allowances` | `Decimal(15, 2)` | `0` | |
| `bankName` | `String?` | — | |
| `accountNumber` | `String?` | — | |
| `paymentMethod` | `String` | `"Bank Transfer"` | |
| `pensionApplicable` | `Boolean` | `true` | **Not currently read by the engine** — see IMPROVEMENTS. |
| `taxStatus` | `String` | `"Taxable"` | **Engine always taxes** regardless — see IMPROVEMENTS. |
| `taxNumber` | `String?` | — | TPIN; surfaced on payslip via the `Settings` company block. |
| `notes` | `String?` | — | |
| `isActive` | `Boolean` | `true` | **Soft-delete flag** — `DELETE` flips this. |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations**

- `payrollRecords PayrollRecord[]` — `onDelete: Cascade` on the child.
- `auditLogs AuditLog[]` — `onDelete: SetNull` on the child.

**Indexes**: `department`, `employmentStatus`, `isActive`.

---

## 4. `PayrollRecord` → table `payroll_records`

The **immutable** product of a payroll run. One row per employee per
period.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `String @id` | `cuid()` | |
| `payrollPeriod` | `String` | — | `YYYY-MM`. |
| `periodStart`, `periodEnd` | `DateTime` | — | First / last day of the month, computed in `/api/payroll`. |
| `employeeId` | `String` FK→Employee | — | Cascade delete: deleting the employee also deletes their history (but soft-delete is preferred). |
| `department`, `position` | `String` | — | **Snapshot** of the values at run-time — payslips stay correct if the employee is later moved. |
| `basicSalary`, `allowances`, `bonuses`, `otherEarnings`, `grossEarnings` | `Decimal(15, 2)` | — | All money fields. |
| `normalOvertimeHours`, `publicHolidayOvertimeHours`, `offDayOvertimeHours` | `Decimal(8, 2)` | `0` | **Three legally-distinct buckets** (1.5× / 2× / 2×). Migration `20260901170112`. |
| `overtimePay` | `Decimal(15, 2)` | `0` | Sum of the three buckets × the appropriate multiplier. |
| `paye` | `Decimal(15, 2)` | — | Calculated by the engine. |
| `pensionEE`, `pensionER` | `Decimal(15, 2)` | — | 5 % / 10 % of pensionable income, capped at MWK 1,000,000. |
| `tevetLevy` | `Decimal(15, 2)` | `0` | 1 % of gross. |
| `fringeBenefitBase` | `Decimal(15, 2)` | `0` | Sum of all FBT-classified taxable values for this employee. |
| `fringeBenefitTax` | `Decimal(15, 2)` | `0` | Employer FBT liability = `ROUND(fringeBenefitBase × rate / 100)`. |
| `fbtSnapshot` | `Json?` | — | **Audit-grade snapshot** of the per-benefit FBT breakdown used for this run. |
| `otherDeductions`, `totalDeductions`, `netPay`, `employerCost` | `Decimal(15, 2)` | `0` / — | |
| `configSnapshot` | `Json?` | — | **Audit-grade snapshot** of the `StatutoryConfig` used. |
| `runDate` | `DateTime` | `now()` | |
| `runBy` | `String` | — | Currently hardcoded `"system"` — see IMPROVEMENTS. |
| `status` | `String` | `"Saved"` | Lifecycle marker. |

**Constraints**: `@@unique([payrollPeriod, employeeId])` — prevents
double-paying an employee for the same period.

**Indexes**: `payrollPeriod`, `employeeId`.

---

## 5. `AuditLog` → table `audit_logs`

Append-only log of every mutating action. Currently a single table for
all entity types.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id` | `cuid()` |
| `timestamp` | `DateTime @default(now())` | |
| `user` | `String` | Currently hardcoded `"system"`. |
| `action` | `String` | `CREATE` / `UPDATE` / `DEACTIVATE` / `PAYROLL_RUN`. |
| `entityType` | `String` | e.g. `Employee`, `Payroll`. |
| `entityId` | `String` | e.g. the employee's `id`, or the period string for `PAYROLL_RUN`. |
| `description` | `String` | Human-readable. |
| `oldValue` | `String?` | JSON-stringified previous state. |
| `newValue` | `String?` | JSON-stringified new state. |
| `ipAddress` | `String?` | **Declared but never populated** (no auth = no source). |
| `employeeId` | `String?` FK→Employee | Optional link; `onDelete: SetNull` (audit survives employee deletion). |

**Indexes**: `(entityType, entityId)`, `timestamp`, `employeeId`.

> **Known issue** — `oldValue` and `newValue` are JSON-stringified
> into a single text column, which is convenient for `JSON.stringify`
> but means you can't query diffs at the DB level. See IMPROVEMENTS
> for the proposed migration to `Json` columns.

---

## 6. `Settings` → table `settings`

A key/value store, used for **statutory config** and **company info**.
All values are stored as `text` (string) for portability.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id` | `cuid()` |
| `key` | `String @unique` | e.g. `statutory.paye_band_1_from`. |
| `value` | `String` | Always a string. |
| `description` | `String?` | |
| `effectiveFrom` | `DateTime` | Enables history (`statutory.pension_ee_rate` can have a row effective 2024-07-01 and another effective 2025-07-01). |
| `category` | `String` | `COMPANY` / `PAYROLL` / `STATUTORY` / `SYSTEM`. |

**Indexes**: `category`.

### Recognised Keys

**COMPANY** (rendered on the payslip header):

```header
company_name, company_address, company_phone, company_email, company_tpin, company_pension_fund
```

**PAYROLL**:

```items
working_hours_per_day
working_days_per_month
currency
decimal_places
```

**STATUTORY** (consumed by the engine):

```list
statutory.paye_band_{N}_from       (N = 1, 2, 3, ...)
statutory.paye_band_{N}_to
statutory.paye_band_{N}_rate       (as percent number, e.g. "30" = 30%)
statutory.pension_ee_rate
statutory.pension_er_rate
statutory.max_pensionable_income
statutory.tevet_levy_rate
statutory.fringe_benefit_tax_rate
statutory.overtime_normal_rate_multiplier
statutory.overtime_public_holiday_rate_multiplier
statutory.overtime_off_day_rate_multiplier
```

> The engine **auto-discovers** the band count by scanning the
> settings map for keys matching
> `statutory.paye_band_(\d+)_(from|to|rate)`. New bands can be
> added in `Settings` without a code change.

**SYSTEM**: free-form app-level flags (none in the current seed).

---

## 6. ER Diagram

```diagram
┌────────────────┐ 1     *  ┌────────────────┐
│    Employee    │──────────│  PayrollRecord  │
│                │          │                 │
│  id  (PK)      │          │  id (PK)        │
│  employeeId    │          │  payrollPeriod  │
│  fullName      │          │  employeeId FK  │
│  department    │          │  configSnapshot │── JSON
│  basicSalary   │          │  fbtSnapshot    │── JSON
│  isActive      │          │  runBy, runDate │
└────────┬───────┘          └────────┬────────┘
          │ 1                        │ 1
          │                         │
          │ *                       │ *
┌────────┴────────┐         ┌───────┴────────────┐
│    AuditLog     │         │   FringeBenefit    │
│                │         │                   │
│  id (PK)       │         │  id (PK)           │
│  action        │         │  payrollRecordId FK│
│  entityType    │         │  type              │
│  entityId      │         │  amount            │
│  oldValue      │── JSON   │  taxableValue      │
│  newValue      │── JSON   │  ...               │
│  employeeId FK │         └───────────────────┘
└─────────────────┘

┌────────────────┐
│    Settings    │
│  id (PK)       │
│  key (UNIQUE)  │
│  value (text)  │
│  effectiveFrom │
│  category      │
└────────────────┘
```

---

## 7. Migrations

Under `prisma/migrations/`:

| Name | What it does |
| --- | --- |
| `20260901030658_init` | Initial schema: all four models. |
| `20260901054845_payroll_config_snapshot` | Adds `PayrollRecord.configSnapshot Json?`. |
| `20260901055119_payroll_config_snapshot` | (Duplicate-named; follow-up tweak — see IMPROVEMENTS to merge/rename.) |
| `20260901170112_add_overtime_hours_to_payroll_record` | Splits `overtimeHours` into three buckets. |
| `20260901202008_add_fringe_benefit_tax` | Adds `FringeBenefit` model, `fringeBenefitBase`, `fringeBenefitTax`, `fbtSnapshot` to `PayrollRecord`. |

**Apply in prod**: `npm run prisma:deploy`.

---

## 9. How the Engine and Schema Interact

```diagram
             ┌─────────────────────┐
             │  PayrollRecord      │
             │                     │
 Settings ──▶│  configSnapshot     │   ← frozen StatutoryConfig
             │  fbtSnapshot        │   ← frozen FBT breakdown
             │  paye, pensionEE, … │   ← frozen computed values
             │                     │
 Employee ──▶│  department (copy)  │   ← frozen department/position
             │  position (copy)    │
             └────────┬────────────┘
                      │ 1
                      │
                      │ *
             ┌────────┴────────────┐
             │   FringeBenefit     │
             │                     │
             │  payrollRecordId FK │
             │  type               │
             │  amount             │
             │  taxableValue       │
             └─────────────────────┘
```

- **At run-time**, the route handler:
   1. Reads `Settings`, picks the rows effective at the end of the
      period, builds `StatutoryConfig` via
      `buildStatutoryConfigFromSettings`.
   2. Reads `Employee`s, copies their `department` / `position` /
      `basicSalary` / `allowances` into the new `PayrollRecord`.
   3. Calls `calculatePayroll` (with optional `fringeBenefits`) → produces every money value.
   4. Writes a `PayrollRecord` with the money values **and** a JSON
      copy of the `StatutoryConfig` and the FBT snapshot.
   5. Writes one `AuditLog` row (`action: 'PAYROLL_RUN'`).

- **At read-time** (payslips, reports, dashboard), nothing recomputes.
   The `PayrollRecord` is treated as the immutable source of truth. If
   the user wants a *recalculation* with new rates, they run a fresh
   payroll period.

---

## 10. Conventions

- **`@map` for snake_case columns** — every field is camelCase in TS,
  snake_case in SQL (`@map("first_name")`).
- **`@db.Decimal(15, 2)` for money** — never `Float` / `Double`.
  Prisma's `Decimal` is round-tripped through `Decimal.js`, which
  is why every route handler `Number()`-coerces it at the boundary.
- **`cuid()` for ids** — collision-resistant, URL-safe, sortable.
- **No enums** — every categorical field is a `String`. This keeps
  migrations cheap (adding a new department is a row, not a
  migration) but loses some compile-time safety. See IMPROVEMENTS.
- **`@@index` for hot filters** — `department`, `employmentStatus`,
  `isActive` on `Employee`; `payrollPeriod` and `employeeId` on
  `PayrollRecord`.
