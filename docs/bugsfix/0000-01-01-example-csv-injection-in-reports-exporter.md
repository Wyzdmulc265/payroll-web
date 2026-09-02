# Bug: Reports CSV exporter allows formula injection in Excel

> This is a **template** file showing the exact shape every
> `docs/bugsfix/<date>-<slug>.md` should take. It is not (yet) a
> record of a real bug — it is the worked example included inline
> in `docs/AI-DOCUMENTATION-INSTRUCTIONS.md` so the format is
> easy to copy.
>
> When you write a real bug fix, replace this preamble with the
> one-paragraph TL;DR and follow the structure below.

**Severity:** high
**Date discovered:** 2026-09-02
**Date fixed:** 2026-09-03
**Reporter:** internal
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#15`

---

## 1. Symptom

A user can produce a CSV export from `/reports` that, when opened
in Microsoft Excel, executes a formula or shell command embedded
in a cell. For example, a cell value of
`=cmd|'/c calc'!A1` opens the Windows Calculator when the file is
opened.

## 2. Reproduction

1. Add a `Settings` row with `key = "company_name"` and
   `value = "=cmd|'/c calc'!A1"`.
2. Generate the **Payroll Register** report for any period.
3. Click "Export CSV".
4. Open the resulting `payroll-register-YYYY-MM.csv` in Excel.
5. The Calculator application launches.

## 3. Impact

- **High** in any environment where Settings values can be set
  by users with edit access. Combined with a phishing attempt, a
  crafted company name or note can run arbitrary code on the
  reviewer's machine.
- Affects every report type that round-trips user-supplied
  strings (Payroll Register, Bank Payment Schedule, Employee
  Earnings History).

## 4. Root cause

`src/app/reports/page.tsx` `exportToCSV` writes each cell to the
CSV output verbatim. Excel interprets a cell starting with
`=`, `@`, `+`, `-`, tab, or CR as a formula and evaluates it.

This is the well-known **CSV-injection (CWE-1236)** class of
bug. OWASP lists it as one of the most common export-related
vulnerabilities.

## 5. Fix

`exportToCSV` now wraps any cell starting with one of the
dangerous prefixes in a single quote (`'`) and prefixes any
leading `'` already present with another `'`:

```ts
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // CWE-1236: prefix with a single quote so Excel does not
  // interpret the cell as a formula.
  if (/^[=@+\-\t\r]/.test(s)) return `'${s.replace(/'/g, "''")}`;
  return s;
}
```

The cell is then wrapped in double quotes (per RFC 4180) and
the existing `replace(/"/g, '""')` escape is applied.

## 6. Verification

- Manual: regenerate the report from §2 with the malicious
  value, open in Excel, confirm the cell renders as
  `=cmd|'/c calc'!A1` (text) and no command runs.
- New unit test: `__tests__/reports.csv.test.ts`:
  - `=cmd|'/c calc'!A1` → `"'=cmd|'/c calc'!A1"`.
  - `+1+1` → `"'+1+1"`.
  - Plain text → unchanged.
  - Cell containing `"` → `"foo""bar"`.

## 7. Prevention

- **Always** route user-supplied strings through an escaping
  function before CSV serialization. Document the helper in
  `docs/UI.md` and require its use in any new report endpoint.
- Add an ESLint rule (or a `code-review` checklist item) that
  flags any `replaceAll(',', '|')`-style CSV serialization
  without an `escapeCsvCell` call.
- Long-term, replace the hand-rolled CSV builder with
  `papaparse` so the escaping is library-grade.
- Audit the existing reports (`Payroll Summary`, `Statutory
  Summary`, `Department Payroll`, `Bank Payment Schedule`,
  `Employee Earnings History`) for the same bug; the fix is
  one shared helper, so the audit is mechanical.
