# Report Spreadsheet HTML Injection

**Severity:** high
**Date discovered:** 2026-10-16
**Date fixed:** 2026-10-16
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

Employee-controlled values were interpolated into the HTML table used for `.xls` downloads without HTML escaping.

## 2. Reproduction

Save a value such as `<img src=x onerror="alert(1)">` in a reportable employee field, then export the report as Excel.

## 3. Impact

The generated spreadsheet could contain active markup when opened or rendered by compatible spreadsheet software. CSV formula escaping does not encode HTML markup.

## 4. Root cause

The export reused `escapeCsvCell` for content placed inside HTML `<th>` and `<td>` elements.

## 5. Fix

Added a dedicated `escapeHtml` text encoder and apply it after CSV formula escaping in the `.xls` HTML export, preserving protection against both formula prefixes and markup injection.

## 6. Verification

Added markup payload tests alongside the existing CSV escaping tests in `src/__tests__/reports.csv.test.ts`; the focused unit suite passes.

## 7. Prevention

Use context-specific output encoding; do not reuse CSV escaping for HTML, attributes, URLs, or scripts.
