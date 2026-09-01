# Fix Payroll UI Totals — Investigation & Implementation Plan

## Problem (as reported)

In payroll processing, totals shown on the UI "are not adding — it just lists the employee amount instead of showing the sum". The user wants the background aggregation verified and fixed.

## Root Cause Found in Code

The pure-TS payroll engine (`src/lib/payroll-engine.ts`) and its math are correct — the engine has passing unit tests in `src/lib/payroll-engine.test.ts` covering PAYE, pension, TEVET, overtime, and the full `calculatePayroll` for the 2026 bands. The bug is in how the **Dashboard** exposes per-department aggregates and how the **Payroll** register pre-aggregates "TOTALS" before the user clicks **Calculate**.

### Bug 1 — Dashboard API does not return per-department `pensionEE`, `pensionER`, `employerCost`

`src/app/api/dashboard/route.ts:40-50` only accumulates `{ employees, gross, net, paye }` per department. The other KPIs are derived in `src/app/dashboard/page.tsx:415-417` as a **proportional estimate**:

```tsx
formatCurrency(dashboardData?.kpis.pensionEE * (dept.gross / (dashboardData?.kpis.grossPayroll || 1)) || 0)
```

This is a weighted estimate, not a real sum. With only one department, it returns the KPI value; with many departments, individual department columns no longer add to the **TOTAL** row (lines 420-429), because the total is the un-proxied KPI while each row is a proxied slice. This is the most likely "totals don't add up" the user is seeing on the Dashboard's *Department Summary* table.

### Bug 2 — `tevetLevy` not stored on `PayrollRecord`

`prisma/schema.prisma:54-86` (`PayrollRecord`) has no `tevetLevy` column. The POST handler in `src/app/api/payroll/route.ts:109` writes `tevetLevy: result.tevetLevy` into `createMany`, which will fail at runtime, or — if a column has since been added — the persisted record will not match the in-memory calculation used by the register's local totals.

### Bug 3 — Payroll register TOTALS row is stale

In `src/app/payroll/page.tsx`, the `totals` reduce (lines 286-306) reads `payrollRows` once on render. It runs on every render — including initial render before **Calculate** has been clicked — so the TOTALS row shows a single employee's pre-filled values (or zeros), not a sum. Worse, `handleCalculate` (lines 194-210) calls `setPayrollRows(prev => prev.map(recalculateRow))` but then reads `payrollRows` (stale closure) for the validity check at line 202. The TOTALS row therefore may not update until the next render triggered by another state change.

## Implementation Tasks

### Task 1 — Fix Dashboard API department aggregation (`src/app/api/dashboard/route.ts`)

In the `byDepartment` reducer (~lines 40-50), add and sum the missing fields so the API returns real per-department totals:

```ts
const byDepartment = records.reduce((acc, r) => {
  const dept = r.employee.department;
  if (!acc[dept]) {
    acc[dept] = {
      department: dept,
      employees: 0,
      gross: 0,
      net: 0,
      paye: 0,
      pensionEE: 0,
      pensionER: 0,
      employerCost: 0,
    };
  }
  acc[dept].employees += 1;
  acc[dept].gross += Number(r.grossEarnings);
  acc[dept].net += Number(r.netPay);
  acc[dept].paye += Number(r.paye);
  acc[dept].pensionEE += Number(r.pensionEE);
  acc[dept].pensionER += Number(r.pensionER);
  acc[dept].employerCost += Number(r.employerCost);
  return acc;
}, {} as Record<string, { department: string; employees: number; gross: number; net: number; paye: number; pensionEE: number; pensionER: number; employerCost: number }>);
```

Update the `charts.payrollByDepartment` mapping (~lines 98-104) to include the three new fields.

### Task 2 — Fix Dashboard table to use real per-department values (`src/app/dashboard/page.tsx`)

Update the `DashboardData` interface (~lines 38-46) so `payrollByDepartment` includes `pensionEE`, `pensionER`, `employerCost`.

Replace the proportional estimates in the department rows (~lines 415-417):

```tsx
<td className="text-right font-mono">{formatCurrency(dept.pensionEE)}</td>
<td className="text-right font-mono">{formatCurrency(dept.pensionER)}</td>
<td className="text-right font-mono text-blue-600">{formatCurrency(dept.employerCost)}</td>
```

Now each row sums exactly to the **TOTAL** row.

### Task 3 — Verify `tevetLevy` persistence in `PayrollRecord`

Open `prisma/schema.prisma` and confirm whether `tevetLevy` was added to the `PayrollRecord` model. If not, add:

```prisma
tevetLevy Decimal @db.Decimal(15, 2) @default(0) @map("tevet_levy")
```

Run `npx prisma migrate dev --name add_tevet_levy` and regenerate the client (`prisma generate`). The `prisma.config.ts` URL and the v7 generator block at `schema.prisma:7-10` must stay intact.

If it already exists, skip the migration; just verify the column name matches the `createMany` payload in `src/app/api/payroll/route.ts:109`.

### Task 4 — Make Payroll register TOTALS reactive and accurate (`src/app/payroll/page.tsx`)

Wrap the `totals` reduce (lines 286-306) in `useMemo` keyed on `payrollRows` so the TOTALS row recomputes whenever rows change:

```tsx
import { useMemo } from 'react';
// ...
const totals = useMemo(
  () => payrollRows.reduce((acc, row) => { /* same body */ }, { /* same initial */ }),
  [payrollRows]
);
```

Also fix the stale-closure validity check in `handleCalculate` (lines 194-210) by computing the new rows first and then reading them:

```tsx
const handleCalculate = async () => {
  setCalculating(true);
  setError(null);
  const recalculated = payrollRows.map(recalculateRow);
  setPayrollRows(recalculated);
  const allValid = recalculated.every(r => r.isValid);
  setStatus(allValid ? 'calculated' : 'error');
  if (!allValid) setError('Some rows have validation errors. Please review.');
  setCalculating(false);
};
```

### Task 5 — Run the engine test suite to confirm math is unchanged

```bash
npm test -- src/lib/payroll-engine.test.ts
```

All 11 existing tests must still pass. The engine is not being modified; this is a regression check.

### Task 6 — Manual smoke test

1. Start the dev server (`npm run dev`).
2. Run payroll for a period with ≥ 2 employees in ≥ 2 departments.
3. Open the Dashboard → confirm the *Department Summary* `TOTAL` row equals the sum of its department rows for **every column** (Gross, Net, PAYE, Pension EE, Pension ER, Employer Cost).
4. Open Payroll Processing → enter overtime/bonuses → click **Calculate** → confirm the TOTALS footer row updates to the column sums and equals the Dashboard's KPI for the same period.
5. Open a payslip → confirm values match the corresponding row in the register.

## Files Touched

- `src/app/api/dashboard/route.ts` (Tasks 1)
- `src/app/dashboard/page.tsx` (Task 2)
- `prisma/schema.prisma` (Task 3, only if `tevetLevy` column is missing)
- `src/app/payroll/page.tsx` (Task 4)
- New prisma migration file (Task 3, conditional)

## Out of Scope

- No engine math changes.
- No changes to the `payslips` page (totals are not aggregated there).
- No changes to `reports/page.tsx` (renders rows from the reports API, not affected).
- No auth / `runBy` changes.

## Risks

- If `tevetLevy` is missing from the schema, every existing payroll POST has either been erroring silently or the column already exists under a different name — confirm by running `prisma db pull` before adding.
- The `prisma.composer` skill folder is present in the repo; ensure we use `npx prisma migrate dev` (not composer) — composer is for an unrelated app framework.

## Validation Checklist

- [ ] `npm test -- src/lib/payroll-engine.test.ts` → all green
- [ ] `npm run lint` (or whatever the repo uses — see `package.json`) → no new errors
- [ ] `npx tsc --noEmit` → no new errors
- [ ] Dashboard department totals match KPI totals
- [ ] Payroll register TOTALS row updates immediately after **Calculate**
- [ ] Save → reload → TOTALS persist (no drift between in-memory and DB)
