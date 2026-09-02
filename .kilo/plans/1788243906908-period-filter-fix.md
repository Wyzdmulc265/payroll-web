# Period Filter: Month Picker Standardization

## Goal
Replace the plain `<select>` period filter on dashboard, payslips, and reports pages with the month picker pattern already used on the payroll page. The new UI combines:
1. A `<select>` of existing payroll periods (from `/api/dashboard` periods list)
2. A native `<input type="month">` next to it that lets the user pick any period
3. When a new period is picked, it's added to the dropdown and selected

## Reference: Existing Pattern in `src/app/payroll/page.tsx`
The payroll page (lines ~355-385) already implements this exact pattern:
```tsx
<select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
  {selectedPeriod && !periods.includes(selectedPeriod) && (
    <option value={selectedPeriod}>{selectedPeriod}</option>
  )}
  {periods.map((p) => <option key={p} value={p}>{p}</option>)}
</select>
<input
  type="month"
  value={selectedPeriod}
  onChange={(e) => {
    const v = e.target.value;
    if (!v) return;
    setSelectedPeriod(v);
    setPeriods((prev) => (prev.includes(v) ? prev : [v, ...prev]));
  }}
/>
```

## Files to Update
- `src/app/dashboard/page.tsx` (lines 195-206: replace the `<select>` block with the combined select + month input)
- `src/app/payslips/page.tsx` (lines 184-192: replace the `<select>` block with the combined select + month input)
- `src/app/reports/page.tsx` (lines 195-203: replace the `<select>` block with the combined select + month input)

## Standardized Period Initialization
In all three pages, replace the hardcoded `'2026-08'` fallback with a derived `suggestedPeriod` (current year-month), matching the payroll page approach:
```tsx
const currentYear = new Date().getFullYear();
const suggestedPeriod = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
const [selectedPeriod, setSelectedPeriod] = useState<string>('');
```

Update each `fetchPeriods` to:
```tsx
if (data.success && data.data.periods) {
  setPeriods(data.data.periods);
  setSelectedPeriod((prev) => prev || data.data.periods[0] || suggestedPeriod);
}
```

This addresses the existing inconsistency where Payslips unconditionally overrode the initial value while Dashboard/Reports preserved it.

## UI Changes per Page

### Dashboard (`src/app/dashboard/page.tsx`)
- Replace lines 195-206 (the single `<select>` inside the header)
- Add a label "Period" before the controls (like payroll page does)
- Add `<input type="month">` after the `<select>`
- Wrap the two controls with a small `flex items-center gap-3` group
- Keep the existing refresh button

### Payslips (`src/app/payslips/page.tsx`)
- Replace lines 184-192 (the period `<select>` inside the selection form)
- Add `<input type="month">` after the `<select>` in the same grid cell (or a new row)
- Keep the existing employee `<select>` and the "Load Payslip" button

### Reports (`src/app/reports/page.tsx`)
- Replace lines 195-203 (the period `<select>` in the 4-column grid)
- Add `<input type="month">` after the `<select>` in the same grid cell
- Adjust the grid if needed (still 4 columns: Report Type, Period, Department, Generate)

## Implementation Steps
1. In `src/app/dashboard/page.tsx`:
   - Add `suggestedPeriod` constant near the top of the component
   - Change `useState<string>('2026-08')` to `useState<string>('')`
   - Update `fetchPeriods` to use the standardized `setSelectedPeriod((prev) => ...)` pattern
   - Replace the period `<select>` markup with the combined select + month input pattern
2. In `src/app/payslips/page.tsx`:
   - Same set of changes as dashboard
3. In `src/app/reports/page.tsx`:
   - Same set of changes as dashboard (already has `useState<string>('')`, just align the effect)
4. Run `npm run build` to confirm no type errors
5. Run `npm test` to confirm tests still pass

## Notes
- The `<input type="month">` native control already enforces YYYY-MM format, so no extra parsing is needed.
- Adding a picked period to the `periods` list (via `setPeriods((prev) => prev.includes(v) ? prev : [v, ...prev])`) means the new period stays available in the dropdown after the user picks it.
- The payroll page's pattern of including `selectedPeriod` as an extra `<option>` when it's not in the existing list keeps the dropdown's selected value visible even if the user picks a period that wasn't previously in the list.
- No API changes are required — the existing `/api/dashboard`, `/api/payslips/[id]`, and `/api/reports` endpoints already accept a `period` query parameter.

## Validation
- `npm run build` succeeds with no TypeScript errors
- `npm test` passes
- On each of the three pages, the period control shows existing periods in a dropdown and lets the user pick a new period via the native month picker
- The new picked period appears in the dropdown and is selected
- The page reloads data (Dashboard auto, Payslips/Reports on button click) for the newly picked period
