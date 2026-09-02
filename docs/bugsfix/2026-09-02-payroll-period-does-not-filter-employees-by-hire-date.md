# Bug: Employees hired after the pay period still appear in payroll

**Severity:** high
**Date discovered:** 2026-09-02
**Date fixed:** 2026-09-02
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

An employee added on 1 September 2026 showed up in the payroll for
August 2026. The period selector did not filter out employees whose
`employmentDate` falls after the selected pay period, so ineligible
employees were included in both the client-side preview and the
persisted payroll run.

## 2. Reproduction

1. Add an employee with `employmentDate = 2026-09-01`.
2. Navigate to `/payroll`, select period `2026-08` in the period picker.
3. Click "Calculate" (or "Save Payroll").
4. The September-hired employee appears in the register and, if
   saved, receives a `PayrollRecord` for August — a period in which
   they were not yet employed.

## 3. Impact

- **Statutory correctness:** an employee hired after a period is
  paid for that period, producing an incorrect payslip and
  incorrect statutory deductions (PAYE, pension, TEVET) for someone
  who was not employed during that period.
- **Audit risk:** the audit trail (`configSnapshot`, `fbtSnapshot`)
  and `AuditLog` would record a payroll run that includes an
  ineligible employee, making late payroll processing and audits
  unreliable.
- **Late processing / backfill:** when re-running or backfilling a
  historical period, recently-hired employees are incorrectly pulled
  into the run.

## 4. Root cause

Three code paths loaded employees without regard to `employmentDate`:

1. `src/app/api/payroll/route.ts` (POST, line 79–84) — the employee
   query filtered only by `isActive: true`. No `employmentDate`
   predicate was applied against `periodEnd` (the last day of the
   selected month, already computed at line 52).

2. `src/app/api/employees/route.ts` (GET, line 26) — the list
   endpoint had no parameter to constrain employees to those hired
   on or before a given date. Callers could only filter by
   `department`, `status`, or `search`.

3. `src/app/payroll/page.tsx` (`fetchEmployees`, line 76) — the
   payroll page called `/api/employees?limit=100` with no date
   constraint, so the client-side preview displayed every active
   employee regardless of the selected period.

The schema already stored `employmentDate` (`prisma/schema.prisma`
line 29) and the payroll route already computed `periodEnd` (line 52);
the filter was simply never wired up.

## 5. Fix

**Filter at the source of truth — the payroll POST endpoint.**

`src/app/api/payroll/route.ts`:

```ts
// Before
const employees = await prisma.employee.findMany({
  where: {
    isActive: true,
    ...(employeeIds && employeeIds.length > 0 ? { id: { in: employeeIds } } : {}),
  },
});

// After
const employees = await prisma.employee.findMany({
  where: {
    isActive: true,
    employmentDate: { lte: periodEnd },
    ...(employeeIds && employeeIds.length > 0 ? { id: { in: employeeIds } } : {}),
  },
});
```

**Expose an `asOf` query parameter on the employees list endpoint** so
the client can request only employees eligible as of a given date.

`src/app/api/employees/route.ts`:

```ts
const asOf = searchParams.get('asOf');
// …
if (asOf) {
  where.employmentDate = { lte: new Date(asOf) };
}
```

**Drive the client-side preview from the same rule.**

`src/app/payroll/page.tsx` — `fetchEmployees` now computes the
period end from `selectedPeriod` and passes it as `asOf`:

```ts
const [py, pm] = selectedPeriod.split('-').map(Number);
const periodEnd = new Date(py, pm, 0);
const asOf = periodEnd.toISOString().split('T')[0];
const res = await fetch(`/api/employees?limit=100&asOf=${asOf}`);
```

## 6. Verification

- `npx tsc --noEmit` — passes, no type errors.
- `npx eslint` on the three changed files — no new errors or warnings.
- Manual reasoning: an employee with `employmentDate = 2026-09-01`
  has `employmentDate > periodEnd (2026-08-31)`, so the `lte` filter
  correctly excludes them from August payroll. An employee hired on
  `2026-08-15` has `employmentDate <= periodEnd` and is correctly
  included.

## 7. Prevention

- The `employmentDate` filter is now applied in **both** the
  client-side preview fetch and the server-side payroll run, so the
  two cannot diverge.
- The new `asOf` parameter on `GET /api/employees` is a general-purpose
  date-eligibility filter that any future caller (e.g. reports,
  dashboard headcount for a historical period) can reuse.
- A unit test on the engine level is not applicable (the engine is
  pure and has no employee filtering). The invariant — "only employees
  hired on or before the period end are processed" — is now enforced
  in the API layer where the DB query lives. Consider adding an
  integration test against a test DB that seeds an employee with a
  future `employmentDate` and asserts the payroll run excludes them.
