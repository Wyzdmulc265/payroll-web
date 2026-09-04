# UI/UX Consistency & Quality Fixes

**Date:** 2026-09-04
**Type:** refactor, UX improvement

## Summary

Batch of UI/UX improvements addressing inconsistencies, duplicated code,
accessibility gaps, and misleading labels across the WizTech Payroll app.

## Changes

### 1. Unified Toast System (`src/hooks/useToast.tsx`)

**Before:** `useToast` only supported green success toasts; error feedback
was inconsistent (`alert()`, inline red boxes, or nothing).

**After:** `useToast` now accepts a `variant` parameter:
- `success` (default, green)
- `error` (red)
- `warning` (amber)
- `info` (blue)

All pages updated to pass `'error'` variant for failure messages.

### 2. Extracted `<PeriodPicker />` Component (`src/components/PeriodPicker.tsx`)

**Before:** Period selection logic (fetching periods from `/api/dashboard`,
maintaining `periods` state, `<select>` + `<input type="month">`) was
copy-pasted across 4 pages (dashboard, payroll, payslips, reports).

**After:** Single `<PeriodPicker />` component with shared logic.
Each page now uses `<PeriodPicker value={...} onChange={...} />`.

### 3. Dashboard Error Surfacing (`src/app/dashboard/page.tsx`)

**Before:** Fetch errors were silently swallowed (`console.error` only);
users saw stale data or empty pages with no explanation.

**After:** Red error banner displayed when dashboard fetch fails,
showing the actual error message.

### 4. Payslip Button Label Fix (`src/app/payslips/page.tsx`)

**Before:** "Export PDF" button called `window.print()` — misleading.

**After:** Renamed to "Print / Save as PDF" to match actual behavior.

### 5. Skip-to-Content Link (`src/app/layout.tsx`)

**Before:** No skip navigation; keyboard users had to tab through
the entire sidebar to reach main content.

**After:** Added a visually-hidden skip-to-content link that becomes
visible on focus, linking to `#main-content`.

### 6. Dashboard Currency Flexibility (`src/app/dashboard/page.tsx`)

**Before:** `formatCompact` hardcoded `MWK` string.

**After:** Uses `dashboardData?.currency` from the API response,
falling back to `MWK`.

### 7. Payslip Table Headers (`src/app/payslips/page.tsx`)

**Before:** All earnings/deduction tables hardcoded "Amount (MWK)".

**After:** Simplified to "Amount" — the formatted values already
include the currency prefix.

### 8. Lucide Icons Replaced Local SVGs (`src/app/reports/page.tsx`, `src/app/payroll/page.tsx`)

**Before:** `Info`, `AlertCircle`, `XCircle` icons were defined as
local SVG components.

**After:** All replaced with `lucide-react` imports. Local SVG
functions removed.

## Files Modified

| File | Change |
|---|---|
| `src/hooks/useToast.tsx` | Enhanced with variant support, `role="status"`, `aria-live` |
| `src/components/PeriodPicker.tsx` | New component |
| `src/app/layout.tsx` | Added skip-to-content link and `#main-content` wrapper |
| `src/app/dashboard/page.tsx` | PeriodPicker, error banner, dynamic currency |
| `src/app/payroll/page.tsx` | PeriodPicker, lucide Info icon, removed local SVG |
| `src/app/payslips/page.tsx` | PeriodPicker, button label fix, simplified table headers |
| `src/app/reports/page.tsx` | PeriodPicker, lucide icons, removed local SVGs |
| `src/app/employees/page.tsx` | Toast variants |
| `src/app/settings/page.tsx` | Toast variants |
| `src/app/businesses/page.tsx` | Toast variants |
| `src/app/users/page.tsx` | Toast variants |

## Testing

- `npm run build` passes
- `npm run lint` passes (no new errors; existing warnings unchanged)
