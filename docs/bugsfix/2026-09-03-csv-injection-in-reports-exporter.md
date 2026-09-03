# Fix CSV formula injection in reports exporter

**Type:** bugfix
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#15`

## 1. Symptom

Exporting a report to CSV or Excel allowed formula-injection attacks.
A cell value starting with `=`, `+`, `-`, `@`, `\t`, or `\r` would be
interpreted as a formula by Excel/LibreOffice, potentially executing
arbitrary commands.

## 2. Reproduction

1. Create an employee with name `=cmd|'/c calc'!A1`.
2. Export the Payroll Register to CSV.
3. Open in Excel → calculator launches.

## 3. Impact

- **Critical** for data exported to spreadsheets that may be opened
  on workstations with macro execution enabled.

## 4. Root cause

`src/app/reports/page.tsx:118` only escaped `"` characters. It did
not prefix formula-injection characters with a single quote.

## 5. Fix

- Extracted `escapeCsvCell` and `csvField` from
  `src/app/audit-logs/page.tsx` into `src/lib/csv.ts`.
- Updated `reports/page.tsx` `exportToCSV` and `exportToExcel` to
  use the shared helpers.
- Updated `audit-logs/page.tsx` to import from `@/lib/csv`.

```ts
// src/lib/csv.ts
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (/^[=@+\-\t\r]/.test(s)) return `'${s.replace(/'/g, "''")}`;
  return s;
}
```

## 6. Verification

- Added `src/__tests__/reports.csv.test.ts` covering formula
  characters, safe strings, and `csvField` quoting.
- Manual: export a report with a `=cmd` value; verify it appears as
  text in Excel.

## 7. Prevention

- Any future CSV/Excel export must import from `@/lib/csv.ts`.
