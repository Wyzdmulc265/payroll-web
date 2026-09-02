# Wire fringe-benefit entry, persistence, and display through UI

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

The server-side FBT engine and API routes already accepted and persisted `fringeBenefitData`, but the payroll page, payslip view, dashboard charts, and reports never surfaced the data. Users could not enter fringe benefits per employee, and FBT columns always showed 0 during live preview. This change closes the end-to-end gap: entry → calculation → persistence → display.

---

## 2. What changed

- Payroll page: per-employee `employeeBenefits` state, inline fringe-benefit modal with conditional fields, benefit chips with live `calculateBenefitValue` preview, and "Add Fringe Benefit" action button per row.
- Payroll page: `recalculateRow` now passes `fringeBenefits` into `PayrollInput`; `handleSave` includes `fringeBenefitData` in the POST body.
- Payroll page: first three columns (Emp ID, Name, Department) are now sticky with `z-index` hierarchy; FBT column color changed from red to amber.
- Payslip page: Employer Contributions section renders per-benefit breakdown from `fbtSummary.benefits`, including excluded benefits.
- Dashboard API: `monthlyTrend` now includes `fringeBenefitTax` in the groupBy `_sum`.
- Dashboard page: monthly trend chart adds an amber FBT area series; department bar chart adds an amber FBT bar.
- Reports API: Statutory Summary now includes `Total FBT Base` between TEVET Levy and Total FBT.

---

## 3. How it works

### Payroll page (`src/app/payroll/page.tsx`)

- New state: `employeeBenefits` (Record keyed by employee `id`), `benefitModalOpen`, `benefitModalEmployeeId`, `benefitForm`.
- `fetchEmployees` seeds `employeeBenefits[emp.id] = []` for every active employee.
- `recalculateRowWithBenefits(row, benefits)` builds a `PayrollInput` with `fringeBenefits` and calls `calculatePayroll`; `recalculateRow` delegates to it using `employeeBenefits[row.id]`.
- `handleSave` builds `fringeBenefitData` from `employeeBenefits` and includes it in the POST body alongside `overtimeData`.
- Modal renders conditional fields based on `benefitForm.type`: `originalCost` for `MOTOR_VEHICLE`, `furnished`/`ownershipType`/rental fields for housing types, `paymentMethod` for `SCHOOL_FEES`, loan fields for `CONCESSIONARY_LOAN`, and `employeeContribution` for all types.
- Chips call `calculateBenefitValue(benefit)` during render; excluded benefits show `0.00` with a dashed border.

### Sticky columns

- Emp ID header: `sticky top-0 left-0 z-30 bg-gray-50`
- Name header: `sticky top-0 left-[6rem] z-20 bg-gray-50`
- Department header: `sticky top-0 left-[16rem] z-20 bg-gray-50`
- Body frozen cells: `sticky left-0 z-10 bg-white`, `sticky left-[6rem] z-10 bg-white`, `sticky left-[16rem] z-10 bg-white`

### Payslip page (`src/app/payslips/page.tsx`)

- After the existing FBT rows in Employer Contributions, a new `FBT Benefit Breakdown` section renders when `payslip.fbtSummary.benefits.length > 0`.
- Each benefit shows `type`, `classification === 'EXCLUDED'` label, `ruleUsed`, and `selectedTaxableValue`.

### Dashboard API (`src/app/api/dashboard/route.ts`)

- Added `fringeBenefitTax: true` to the `monthlyTrend` groupBy `_sum`.
- The `monthlyTrend` response now maps `fbt: Number(m._sum.fringeBenefitTax || 0)`.

### Dashboard page (`src/app/dashboard/page.tsx`)

- `DashboardData.monthlyTrend` interface extended with `fbt: number`.
- Monthly trend chart: added `<Area dataKey="fbt" name="FBT" stroke="#d97706" fill="url(#colorFbt)" />` and matching gradient def.
- Department bar chart: added `<Bar dataKey="fbt" name="FBT" fill="#d97706" radius={[0, 4, 4, 0]} />`.

### Reports API (`src/app/api/reports/route.ts`)

- Statutory Summary case adds `totalFBTBase` reduction and inserts `formatCurrency(totalFBTBase)` between TEVET and FBT columns.
- Employer statutory cost total now includes `totalFBTBase`.

---

## 4. What got better

- **End-to-end FBT workflow**: users can now enter fringe benefits per employee on the payroll page, see live taxable-value previews as chips, and persist the data through Save Payroll.
- **Statutorily correct display**: payslips show the per-benefit breakdown with rule names, supporting MRA audit requirements.
- **Dashboard visibility**: FBT appears in both the monthly trend area chart and the department bar chart, giving finance a complete cost picture.
- **Reports completeness**: Statutory Summary includes both FBT Base and FBT, matching the Payroll Register columns.

---

## 5. Risks and trade-offs

- `calculateBenefitValue` is called during render for every chip. For typical payroll volumes (a handful of benefits per employee) this is negligible, but a very large benefit set per employee could slow re-renders. Consider memoizing chip valuations if performance becomes visible.
- The `fbtSnapshot` JSON already preserves full benefit detail per payroll run; the Prisma `FringeBenefit` model columns remain narrow (`type`, `description`, `amount`, `taxableValue`). Expanding the model (Task 4b follow-up) will require a migration.
- Sticky column `left` offsets are hardcoded to match current `w-*` classes. If column widths change, the offsets must be updated in tandem.

---

## 6. Test plan

- TypeScript: `npx tsc --noEmit` passes.
- ESLint: all introduced errors fixed; remaining warnings are pre-existing.
- Manual payroll flow: add a motor-vehicle benefit, verify FBT Base and FBT update live, save payroll, open payslip, verify benefit breakdown renders, check dashboard charts and Statutory Summary report.

---

## 7. Follow-ups

- Prisma migration to expand `FringeBenefit` model with `paymentMethod`, `effectiveFrom`, `effectiveTo`, `originalCost`, `furnished`, `ownershipType`, `ruleUsed`, and `auditTrail` JSON.
- Dedicated FBT quarterly-return page (MRA Section 17).
- Bulk fringe-benefit import via CSV.
