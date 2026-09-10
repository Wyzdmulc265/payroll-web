# Add employee Excel/CSV batch import

**Type:** feature
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** none

## 1. Why

Adding employees one-by-one through the modal is slow for bulk onboarding (e.g. 20–50 new hires at the start of a quarter). A downloadable template + one-click import removes the repetitive form-filling and reduces data-entry errors.

## 2. What changed

- A new **Import** button appears on the `/employees` page for users with `MANAGE_EMPLOYEES`.
- Clicking it opens `/employees/import`, a dedicated page with:
  - Drag-and-drop dropzone accepting `.csv`, `.xlsx`, and `.xls` files.
  - **Browse Files** button and **Download Template** button (CSV).
  - **Preview step**: parsed rows are shown in a table with per-row validation errors. Invalid rows are skipped on confirm.
  - **Confirm step**: valid rows are POSTed to a new bulk endpoint; results (imported/failed) are shown.
- A new `POST /api/employees/import` endpoint accepts an array of employee rows, validates each, deduplicates by `employeeId` and `nationalId`, creates all valid rows in a single transaction, and emits one `EMPLOYEES_IMPORTED` audit event.
- The sidebar nav now includes **Import Employees** for `MANAGE_EMPLOYEES` roles.

## 3. How it works

- **Client-side parsing**: `papaparse` (CSV) and `exceljs` (XLSX/XLS) parse the uploaded file in the browser. The API never receives a binary file — only a JSON array of rows. `xlsx` (SheetJS) was initially chosen but removed because it has two high-severity, unpatched vulnerabilities (prototype pollution and ReDoS) with no fix available from the maintainer.
- **Row schema**: `src/lib/import-employees.ts` exports `importEmployeeRowSchema` (Zod), used both client-side for preview validation and server-side for final validation.
- **Bulk create**: `src/app/api/employees/import/route.ts` iterates the validated rows, checks for duplicate `employeeId` and `nationalId` per business, then creates all valid rows inside a single `prisma.$transaction`. PII fields (`nationalId`, `accountNumber`, `taxNumber`) are encrypted via the existing `encryptPii` helper.
- **Audit**: one `AuditLog` row per import batch (`EMPLOYEES_IMPORTED`), with the count and internal IDs of created employees.
- **Template**: the Download Template button generates a CSV with all column headers and two example rows, using the same column order as `IMPORT_COLUMNS` in `src/lib/import-employees.ts`.

## 4. What got better

- **Productivity**: bulk onboarding replaces N sequential modal opens with a single file upload.
- **Auditability**: one `EMPLOYEES_IMPORTED` audit row per batch, with full before/after data.
- **Safety**: preview step surfaces validation errors before any rows are written; invalid rows are skipped, not partially committed.
- **Type safety**: the same Zod schema is shared between client preview and server validation.

## 5. Risks and trade-offs

- **New dependencies**: `papaparse` (~45 KB) and `exceljs` (~500 KB) replaced the initially chosen `xlsx` package. `xlsx` had two high-severity, unpatched vulnerabilities (prototype pollution GHSA-4r6h-8v6p-xvw6 and ReDoS GHSA-5pgg-2g8v-p4x9) with no fix available. `papaparse` is the de facto standard CSV parser for the browser; `exceljs` is actively maintained and supports client-side XLSX reading. Both are zero native-dep packages.
- **Client-side parsing**: very large files (1000+ rows) will block the main thread during parsing. The existing employee list paginates at 20–100 rows, so typical imports are small. If large-file imports become common, a Web Worker or server-side parse path can be added later.
- **No partial rollback**: within a single import, valid rows are committed together. If the transaction fails mid-way (e.g. DB connection loss), zero rows are written (transaction abort). There is no "import 50 of 100" partial state.

## 6. Test plan

- `npm run lint` — passes.
- `npm run build` — passes.
- Manual: download the template, fill 3 rows (one with a bad `employeeId`), upload, verify the preview shows 2 valid / 1 invalid, click Import, verify 2 employees created and 1 row in the failed list.

## 7. Follow-ups

- Add a Web Worker for parsing large files (>500 rows) to avoid main-thread blocking.
- Support `.xls` (BIFF) parsing more robustly — `xlsx` handles it, but the existing HTML-table export in reports also produces `.xls`; unify the format.
- Add an integration test for `POST /api/employees/import` covering duplicate `employeeId`, duplicate `nationalId`, and successful batch create.
