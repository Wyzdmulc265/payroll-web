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
- Core API routes require an active session cookie. Route permissions return `401`
  for missing/invalid sessions and `403` for insufficient role permissions.
- Business-owned queries are scoped from the authenticated user's `businessId`;
  callers cannot supply a business ID to override that scope.

## Authentication

### `POST /api/auth/login`

Accepts `{ "email": "user@example.com", "password": "StrongPass1" }`, creates
a one-day HttpOnly session cookie, and returns safe user identity fields. Five
attempts per 15-minute window are allowed per client key; further attempts return
`429` with `Retry-After`.

### `POST /api/auth/logout`

Invalidates the current server-side session and clears the session cookie.

### `GET /api/auth/me`

Returns the authenticated user's `id`, `email`, `role`, `status`, and `businessId`.

### `POST /api/auth/forgot-password`

Accepts `{ "email": "user@example.com" }` and always returns a generic success
message when the input is valid. Reset tokens expire after one hour and are stored
hashed. Email delivery remains a deployment follow-up.

### `POST /api/auth/reset-password`

Accepts `{ "token": "..." , "newPassword": "StrongPass1" }`, consumes a pending
token, updates the password, and invalidates all existing sessions.

### `GET /api/users`

List users in the actor's business, newest first, paginated.

| Query | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | `number` | `1` | 1-indexed. |
| `limit` | `number` | `50` | Page size. |

**Response `200`**:

```json
{
  "success": true,
  "data": [
    { "id": "ck...", "email": "ops@example.com", "role": "PAYROLL_OPERATOR", "status": "ACTIVE", "businessId": "biz...", "createdAt": "...", "updatedAt": "..." }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 4, "totalPages": 1 }
}
```

- Requires `READ_USERS` and an assigned `businessId` (`SUPER_ADMIN` without a
  business context gets `403`). Responses never include `passwordHash`.
- `403` for roles without `READ_USERS`; `401` without a valid session.

### `POST /api/users`

Create a user in the actor's business.

**Body** (Zod-validated):

```json
{ "email": "ops@example.com", "password": "StrongPass1", "role": "PAYROLL_OPERATOR" }
```

- `role` is restricted to `ADMIN | PAYROLL_OPERATOR | VIEWER`; `SUPER_ADMIN` is
  rejected (`400`) to prevent privilege escalation.
- Password follows the shared policy (min 8 chars, one uppercase, one number).
- Password is hashed with bcryptjs (10 rounds); `businessId` is taken from the
  session, never the request body.
- `400` on duplicate email or validation failure; requires `MANAGE_USERS`.
- Emits `USER_CREATED` audit event with actor, business, and IP.

**Response `201`**: `{ success: true, data: { <safe user fields> } }`.

### `GET /api/users/[id]`

Single user within the actor's business. `404` if not found or in another
business. Requires `READ_USERS`.

### `PUT /api/users/[id]`

Update a user in the actor's business.

**Body** (all optional):

```json
{ "email": "ops@example.com", "role": "PAYROLL_OPERATOR", "status": "ACTIVE", "password": "NewStrong1" }
```

- Setting `role` to `SUPER_ADMIN` is rejected (`403`/`400`).
- An actor cannot change their own role or deactivate themselves (`403`).
- `password`, when provided, is re-hashed; otherwise the existing hash is kept.
- `400` on empty body or duplicate email; requires `MANAGE_USERS`.
- Emits `USER_UPDATED` audit event (sanitized old/new values, no hashes).

### `DELETE /api/users/[id]`

Logically deactivate a user: `status` becomes `INACTIVE` so the account can no
longer sign in. Current sessions remain but are rejected by session validation.

- `404` if not found or in another business; self-deactivation is `403`.
- Requires `MANAGE_USERS`; emits `USER_DEACTIVATED` audit event.

---

## 1. Employees

### `GET /api/employees`

List employees, paginated and filterable.

| Query | Type | Default | Description |
| --- | --- | --- | --- |
| `department` | `string` | — | Filter by exact department. `'All'` = no filter. |
| `status` | `string` | — | Filter by `employmentStatus`. `'All'` = no filter. |
| `search` | `string` | — | Case-insensitive search over `firstName`, `lastName`, `employeeId`. |
| `asOf` | `string` `YYYY-MM-DD` | — | When provided, only employees whose `employmentDate` is on or before this date are returned. Used by the payroll page to exclude employees hired after the selected pay period. |
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
- Emits `AuditLog` with `action: 'EMPLOYEE_CREATED'`, `user` set to the
  authenticated user's email.

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
2. Loads all active employees whose `employmentDate` is on or before the
   **end of the period** (filtered by `employeeIds` if given). An employee
   hired after the period (e.g. Sep 1 for an August payroll) is excluded
   so only eligible employees are processed.
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
| `401` | Missing, invalid, or expired session cookie on protected routes. |
| `403` | Authenticated user lacks the required role permission. |
| `404` | `payslips/:id` when no record matches. |
| `429` | Too many login attempts; includes `Retry-After` header (seconds). |
| `500` | Any unexpected error — logged with `console.error`, returns generic envelope. |

Every error response has the shape:

```json
{ "success": false, "error": "<human-readable>", "details": [<optional Zod issue array>] }
```
