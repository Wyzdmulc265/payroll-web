# Remove dead `fetchDepartments` and data-drive department select

**Type:** refactor
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#22`, `docs/IMPROVEMENTS.md#9`

## 1. Why

`employees/page.tsx` had a `fetchDepartments` function that performed
a second, unfiltered `GET /api/employees` request solely to extract
department names. The existing `fetchEmployees` already extracted
departments from its own response (line 95). The department `<select>`
in the Add/Edit modal also listed hardcoded options instead of using
the live data.

## 2. What changed

- Deleted `fetchDepartments` and its `useEffect` call.
- Replaced the hardcoded department `<option>` list in the modal with
  a dynamic map over the `departments` state already populated by
  `fetchEmployees`.

## 3. How it works

The modal's department select now renders:

```tsx
{departments.map((dept) => (
  <option key={dept} value={dept}>{dept}</option>
))}
```

This ensures the dropdown always reflects the actual departments in
the database.

## 4. What got better

| Before | After |
|--------|-------|
| 2 API requests on every filter/page change. | 1 API request. |
| Hardcoded department list in modal. | Live, data-driven list. |

## 5. Risks and trade-offs

- None. The `departments` array is already maintained by
  `fetchEmployees`.

## 6. Test plan

- Manual: add a new employee with a new department name, then open
  the Add modal and verify the new department appears in the select.

## 7. Follow-ups

- Delete the hardcoded department list from the filter `<select>`
  (it is already data-driven there).
