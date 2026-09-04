# Manage company departments from Settings

**Type:** feature
**Date:** 2026-09-04
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

There was nowhere to add a company department. The employee form's
department `<select>` only listed departments already present on existing
employees — on a fresh business it was empty, and a department like
"Operations" could never be pre-defined before hiring into it (only a raw
API call could introduce a new name). See `docs/IMPROVEMENTS.md#9`.

## 2. What changed

- Settings → Company tab has a **Departments** editor: add/remove names,
  saved together with the tab's batch save.
- The employee list filter and Add/Edit modal now offer the union of
  configured departments and departments seen on employees.
- New `company.departments` setting (JSON array), validated server-side on
  both settings write paths; seed adds a default list for the dev business.

## 3. How it works

- `src/lib/departments.ts` (new, dependency-free so routes and client
  components can share it): `parseDepartmentsSetting` (lenient, for display),
  `validateDepartmentsValue` (strict: JSON array, ≤ 50 names, each 1–100
  chars, case-insensitive unique), plus the `company.departments` key
  constant.
- `src/app/api/settings/batch/route.ts` and `src/app/api/settings/route.ts`
  (single POST) reject invalid `company.departments` values with a 400 and a
  specific message.
- `src/app/settings/page.tsx` — COMPANY tab: list with per-row Remove, input
  + Add (Enter works), inline errors; the tab save includes
  `company.departments: JSON.stringify(departmentsForm)` in its batch.
- `src/app/employees/page.tsx` — fetches `/api/settings` once on mount,
  merges configured names with employee-derived ones (`allDepartments`,
  sorted); both selects use it. Empty state hints "add them in Settings →
  Company".
- `prisma/seed.ts` — seeds `company.departments` with
  `["Admin","Finance","HR","IT","Sales"]` for the dev business.
- Deliberately **no migration and no Department table**: settings are
  already per-business, and `Employee.department` stays a free string (plus
  its payroll snapshot semantics), so previously assigned departments keep
  working even if removed from the list.

## 4. What got better

- **Before:** departments could only emerge as a side effect of hiring; a
  new business had an empty, unfillable dropdown.
- **After (qualitative):** ADMINs define the org structure up front in
  Settings; the employee form offers exactly that list (plus any legacy
  names already in use).

## 5. Risks and trade-offs

- Removing a department from the list does not retag existing employees
  (by design — historical payrolls reference the name string). The stale
  name still appears in the dropdown via the employee-derived union until
  no employee uses it.
- `company.departments` edited via Advanced mode (raw) is still
  server-validated, so a malformed JSON value cannot be saved from any path.

## 6. Test plan

- `npx tsc --noEmit` — clean; `npx eslint` on touched files — 0 errors
  (pre-existing warnings only).
- Scratch vitest (removed after use): helpers (lenient parse skips bad
  entries, strict rejects non-JSON/duplicates) and route-level batch save
  (valid list → 200, duplicates → 400 with message) — all passed.
- Manual: fresh business → Settings → Company → add "Operations" → save →
  Employees → Add → "Operations" is selectable; filter lists it too.

## 7. Follow-ups

- Report/payroll pages derive their department pickers from employees only;
  extend them to the configured list if pre-filtering by an empty department
  becomes a use case.
- `docs/IMPROVEMENTS.md#9` is now addressed and should be marked done.
