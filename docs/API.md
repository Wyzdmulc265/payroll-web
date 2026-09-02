# API Reference

This document lists every HTTP route exposed by WizTech Payroll Web.

**Conventions:**

- All routes are **Next.js App Router route handlers** under
  `src/app/api/.../route.ts`.
- All routes return a uniform envelope:
  `{ success: boolean, data?, error?, details? }`.
- `ZodError` is mapped to `400` with a per-field `details` array.
- All money is returned as **JS `number`**, not string — the routes
  `Number()`-coerce Prisma `Decimal` values at the boundary.
- All write paths emit an `AuditLog` row.
- **Auth is not yet wired** — every route is currently public. See
  [`IMPROVEMENTS.md`](./IMPROVEMENTS.md#1).

---

## 1. Employees

### `GET /api/employees`

List employees, paginated and filterable.

| Query | Type | Default | Description |
| --- | --- | --- | --- |
| `department` | `string` | — | Filter by exact department. `'All'` = no filter. |
| `status` | `string` | — | Filter by `employmentStatus`. `'All'` = no filter. |
| `search` | `string` | — | Case-insensitive search over `firstName`, `lastName`, `employeeId`. |
| `page` | `number` | `1` | 1-indexed. |
| `limit` | `number` | `20` | Page size. |

**Response `200`**:

```json
{
  "success": true,
  "data": [
    {
      "id": "ckxxx...",
      "employeeId": "EMP001",
      "firstName": "Jane",
      "lastName": "Banda",
      "fullName": "Jane Banda",
      "department": "Finance",
      "position": "Accountant",
      "basicSalary": 1500000,
      "allowances": 200000,
      "isActive": true,
      "...": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 47, "totalPages": 3 }
}
```

### `POST /api/employees`

Create one employee. Zod schema in source (lines 5–24 of
`api/employees/route.ts`).

- `employeeId` must match `^EMP\d{3}$`.
- `employmentDate` is coerced via `z.coerce.date()`.
- `basicSalary` is `z.number().positive()`.
- On duplicate `employeeId`: `400 { success: false, error: "Employee ID already exists" }`.
- Emits `AuditLog` with `action: 'CREATE'`, `user: 'system'`.

**Response `201`**: `{ success: true, data: <employee> }`.

### `GET /api/employees/:id`

Fetch one employee, including the last 12 `PayrollRecord`s.

**Response `200`**: `{ success: true, data: { ...employee, payrollHistory: [...] } }`.

### `PUT /api/employees/:id`

Partial update. Re-validates against a derived schema (`employeeSchema.partial()`).
Recomputes `fullName` if either name changes. Emits `AuditLog` with
`action: 'UPDATE'` and `oldValue` / `newValue` JSON snapshots.

### `DELETE /api/employees/:id`

**Soft delete only.** Flips `isActive = false` and `employmentStatus = 'Inactive'`.
Historical `PayrollRecord`s are preserved.

---

## 2. Payroll

### `POST /api/payroll`

Run payroll for a given period.

**Body** (Zod-validated, see source lines 6–18):

```json
{
  "payrollPeriod": "2026-08",
  "employeeIds": ["ckxxx..."],   // optional; default = all active
  "overtimeData": [
    {
      "employeeId": "ckxxx...",
      "normalOvertimeHours": 0,
      "publicHolidayOvertimeHours": 0,
      "offDayOvertimeHours": 0,
      "bonuses": 0,
      "otherEarnings": 0,
      "otherDeductions": 0
    }
  ],
  "fringeBenefitData": [
    {
      "employeeId": "ckxxx...",
      "benefits": [
        {
          "type": "MOTOR_VEHICLE",
          "description": "Company car",
          "amount": 30000000,
          "originalCost": 30000000,
          "effectiveFrom": "2026-08-01"
        },
        {
          "type": "SCHOOL_FEES",
          "paymentMethod": "DIRECT_TO_INSTITUTION",
          "amount": 4000000,
          "effectiveFrom": "2026-08-01"
        }
      ]
    }
  ]
}
```

**Behaviour:**

1. Loads `Settings`, picks the rows effective at the **end of the period**
   (`selectEffectiveSettings`), builds `StatutoryConfig`.
2. Loads all active employees (filtered by `employeeIds` if given).
3. Rejects the run if any employee has `salaryFrequency !== 'Monthly'`
   (engine limitation; better to fail loud than miscalculate).
4. Refuses the run if any `PayrollRecord` already exists for the period
   (also enforced by `@@unique([payrollPeriod, employeeId])`).
5. For each employee: calls `calculatePayroll` with the period-specific
   `workingDaysInPeriod` from `getWorkingDaysInMonth(year, month)`.
   If `fringeBenefitData` is provided, `calculateEmployerFBT` is called
   for that employee's benefits. `FringeBenefit` rows are created inside
   the same transaction, and `fbtSnapshot` is stored on the `PayrollRecord`.
6. Bulk-creates `PayrollRecord`s **plus** `FringeBenefit`s **plus** one
   `AuditLog` in a single `prisma.$transaction`.

**Response `200`**: `{ success: true, data: { payrollPeriod, processedCount, periodStart, periodEnd } }`.

**Response `400`**: one of:

- `Period must be YYYY-MM` (Zod regex).
- `No active employees found`.
- `Engine only supports Monthly salaries; N employee(s) use other frequencies`.
- `Payroll already exists for period {period}`.

### `GET /api/payroll`

List `PayrollRecord`s, with summary roll-up.

| Query | Type | Description |
| --- | --- | --- |
| `period` | `string` | Filter by `payrollPeriod`. |
| `employeeId` | `string` | Filter by employee `id`. |
| `department` | `string` | Filter by department; `'All'` = no filter. |

**Response `200`**: `{ success: true, data: [...records], summary: { totalGross, totalPAYE, ... } }`.

### `POST /api/payroll/calculate`

**Stateless live preview** for the "Calculate" step of the
`/payroll` page. Same engine call, no DB writes.

**Body**:

```json
{
  "payrollPeriod": "2026-08",
  "input": {
    "basicSalary": 1500000,
    "allowances": 200000,
    "normalOvertimeHours": 0,
    "publicHolidayOvertimeHours": 0,
    "offDayOvertimeHours": 0,
    "bonuses": 0,
    "otherEarnings": 0,
    "otherDeductions": 0
  }
}
```

**Response `200`**: `{ success: true, data: <PayrollResult> }`.

### `GET /api/fbt`

Returns the FBT breakdown for a single employee in a single period.

| Query | Type | Required | Description |
| --- | --- | --- | --- |
| `period` | `string` `YYYY-MM` | yes | Payroll period. |
| `employeeId` | `string` | yes | Employee `id` (internal PK). |

**Response `200`**:

```json
{
  "success": true,
  "data": {
    "employeeId": "EMP001",
    "employeeName": "John Banda",
    "department": "IT",
    "position": "Software Engineer",
    "payrollPeriod": "2026-08",
    "fringeBenefitBase": 4500000,
    "fringeBenefitTax": 1350000,
    "fbtSnapshot": {
      "totalTaxableValue": 4500000,
      "fbtRate": 30,
      "fringeBenefitsTax": 1350000,
      "benefits": [
        {
          "type": "MOTOR_VEHICLE",
          "classification": "FBT",
          "selectedTaxableValue": 4500000,
          "ruleUsed": "MOTOR_VEHICLE_15PCT",
          "auditTrail": [...]
        }
      ]
    },
    "fringeBenefits": [
      {
        "id": "ckxxx...",
        "type": "MOTOR_VEHICLE",
        "description": "Company car",
        "amount": 30000000,
        "taxableValue": 4500000,
        "createdAt": "2026-08-15T10:30:00.000Z"
      }
    ]
  }
}
```

**Response `400`** if `period` or `employeeId` is missing.
**Response `404`** if no payroll record exists for the pair.

---

## 3. Payslips

### `GET /api/payslips/:id?period=YYYY-MM`

Returns a fully-formatted payslip for one employee, one period. The route:

1. Finds the `PayrollRecord` for `:id` + `period`.
2. Looks up `Settings` with `category = 'COMPANY'` for the company
   header (name, address, phone, email, TPIN, pension fund).
3. Returns a flat `payslip` object with currency-formatted strings.

**Query**: `period` is **required**.

**Response `200`**: `{ success: true, data: { payslip: { employee, period, company, earnings, deductions, totals, fringeBenefitBase, fringeBenefitTax, fbtSummary, currency } } }`.

**Response `404`** if no record exists for the given period/employee pair.

---

## 4. Reports

### `GET /api/reports`

Server-side report data, formatted as `headers` + `rows` for client-side
CSV/Excel export.

| Query | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | yes | One of: `Payroll Register`, `Payroll Summary`, `Statutory Summary`, `Department Payroll`, `Bank Payment Schedule`, `Employee Earnings History`. |
| `period` | `string` `YYYY-MM` | yes | The pay period to report on. |
| `department` | `string` | for `Department Payroll` and `Employee Earnings History` | Filter. |
| `employeeId` | `string` | for `Employee Earnings History` | Specific employee. |

**Response `200`**:

```json
{
  "success": true,
  "data": {
    "type": "Payroll Register",
    "period": "2026-08",
    "department": "All",
    "headers": ["Employee ID", "Employee Name", "..."],
    "rows": [["EMP001", "Jane Banda", "..."], ["..."]],
    "generatedAt": "2026-08-15T10:30:00.000Z"
  }
}
```

**Report semantics:**

- `Payroll Register` — one row per employee, full breakdown, money
  columns pre-formatted with `formatCurrency`. Includes `FBT Base` and `FBT`.
- `Payroll Summary` — one row per department, totals. Includes `Total FBT`.
- `Statutory Summary` — single-period totals; TEVET is **recomputed
  live** from `grossEarnings × config.tevetLevyPercent / 100` rather
  than summing the stored `tevetLevy` column. Includes `Total FBT`.
- `Department Payroll` — one row per employee but with department as
  the first column and the list grouped by department. Includes `FBT`.
- `Bank Payment Schedule` — only rows where `bankName` and
  `accountNumber` are set; for uploading to a banking portal.
- `Employee Earnings History` — historical periods up to and including
  the requested one; requires `employeeId`. Includes `Fringe Benefit Base`
  and `FBT`.

---

## 5. Settings

### `GET /api/settings?category=COMPANY`

List all `Settings` rows, optionally filtered by `category`. Categories:
`COMPANY`, `PAYROLL`, `STATUTORY`, `SYSTEM`.

**Response `200`**: `{ success: true, data: [...rows] }`.

### `POST /api/settings`

**Upsert** by `key`. If `effectiveFrom` is omitted, defaults to now.

**Body** (Zod-validated):

```json
{
  "key": "statutory.pension_ee_rate",
  "value": "5",
  "description": "Employee pension contribution %",
  "category": "STATUTORY",
  "effectiveFrom": "2024-07-01"
}
```

> **Caveat** — this endpoint does not insert a *new row*; it **upserts**
> by key. To preserve a historical value and add a new effective-from
> date, the schema would need a composite unique key (`@@unique([key, effectiveFrom])`).
> See [`IMPROVEMENTS.md`](./IMPROVEMENTS.md#24).

**Response `200`**: `{ success: true, data: <setting> }`.

### `DELETE /api/settings?key=...`

Delete the row whose `key` matches.

**Response `200`**: `{ success: true }`.

> **Caveat** — this endpoint does **not** emit an `AuditLog` entry. See
> [`IMPROVEMENTS.md`](./IMPROVEMENTS.md#4) for the follow-up.

---

## 6. Dashboard

### `GET /api/dashboard`

**Two-mode endpoint**, switched on the `period` query param.

#### `GET /api/dashboard` (no `period`)

Returns the list of distinct payroll periods (most recent first), so
the dashboard's period picker has options.

**Response `200`**: `{ success: true, data: { periods: ["2026-08", "2026-07", ...] } }`.

#### `GET /api/dashboard?period=YYYY-MM`

Returns the full dashboard payload:

- `kpis` — `activeEmployees`, `grossPayroll`, `totalDeductions`,
  `netPayroll`, `paye`, `pensionEE`, `pensionER`, `fbt`, `employerCost`
  (each as a raw number **and** a `formatted` string).
- `charts.payrollByDepartment` — array of `{ department, employees, gross, net, paye, pensionEE, pensionER, fbt, employerCost }`.
- `charts.monthlyTrend` — last 12 periods, `[{ period, gross, net, paye }]`.
- `charts.headcountTrend` — last 12 periods, `[{ period, count }]`.

**Response `200`**: full payload as above.

---

## 7. Common Error Responses

| Status | When |
| --- | --- |
| `400` | `ZodError` (validation); explicit pre-conditions (e.g. payroll already exists for period; non-Monthly employee in `/api/payroll`). |
| `404` | `payslips/:id` when no record matches. |
| `500` | Any unexpected error — logged with `console.error`, returns generic envelope. |

Every error response has the shape:

```json
{ "success": false, "error": "<human-readable>", "details": [<optional Zod issue array>] }
```
