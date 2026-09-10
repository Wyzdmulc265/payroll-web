# Fix 8 pre-existing ESLint warnings across 5 files

**Type:** refactor
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** none

## 1. Why

The codebase had 8 pre-existing ESLint warnings that reduced code quality and could mask real issues. All are fixable without changing behavior. Prisma stays at v7 — the mysql2 vulnerability is a transitive dependency of Prisma's internal engine and cannot be resolved without downgrading Prisma, which is explicitly out of scope.

## 2. What changed

Fixed all 8 pre-existing ESLint warnings across 5 files:

| File | Warning | Fix |
| --- | --- | --- |
| `src/app/businesses/page.tsx:122` | `useEffect` missing `openDrawer` dep | Added `openDrawer` to deps (it only uses state setters, which are stable references) |
| `src/app/dashboard/page.tsx:100` | `useEffect` missing `fetchDashboard` dep | Wrapped `fetchDashboard` in `useCallback` with `selectedPeriod` dep; added to `useEffect` deps |
| `src/app/employees/page.tsx:122` | `useEffect` missing `fetchEmployees` dep | Wrapped `fetchEmployees` in `useCallback` with `[pagination, search, departmentFilter, statusFilter]` deps; added to `useEffect` deps |
| `src/app/payroll/page.tsx:240` | `useEffect` missing `fetchConfig` dep | Wrapped `fetchConfig` in `useCallback` with empty deps; added to empty `useEffect` deps array |
| `src/app/payroll/page.tsx:250` | `useEffect` missing `fetchEmployees` dep | Wrapped `fetchEmployees` in `useCallback` with `selectedPeriod` dep; added to `useEffect` deps |
| `src/app/settings/page.tsx:284` | `setFormErrors` never used | Removed unused `setFormErrors` from `useState` destructuring; `formErrors` getter retained for display |
| `src/app/settings/page.tsx:465` | `window.location.href` navigation | Replaced with `useRouter().push('/login?reset=1')` |
| `src/components/PeriodPicker.tsx:41` | `useEffect` missing `onChange`, `suggestedPeriod`, `value` deps | Added all three to deps array |

## 3. How it works

### Pattern for `fetchX` + `useEffect` warnings

The root cause was that fetch functions were defined inline in the component body (recreated every render) but used in `useEffect` with a restricted dep array. The fix:

1. Wrap the fetch function in `useCallback` with the state values it reads as dependencies.
2. Add the `useCallback`-wrapped function to the `useEffect` dependency array.
3. Remove the `// eslint-disable-next-line react-hooks/set-state-in-effect` comments since deps are now explicit.

Example (dashboard):
```tsx
const fetchDashboard = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`/api/dashboard?period=${selectedPeriod}`);
    // ...
  } finally {
    setLoading(false);
  }
}, [selectedPeriod]);

useEffect(() => {
  if (selectedPeriod) {
    fetchDashboard();
  }
}, [selectedPeriod, fetchDashboard]);
```

### Pattern for `window.location.href`

Replaced with Next.js `useRouter`:
```tsx
const router = useRouter();
// ...
router.push('/login?reset=1');
```

### Pattern for unused setter

Removed the unused setter from the `useState` destructuring. The getter (`formErrors`) is still read for display, but since it's never written to either, the error display UI is dead code — left for a separate cleanup PR to avoid scope creep.

## 4. What got better

- **Zero ESLint warnings**: all 8 pre-existing warnings eliminated.
- **Explicit reactivity**: `useCallback` + explicit deps makes data-fetch triggers obvious and prevents stale-closure bugs.
- **Next.js navigation**: `useRouter().push()` preserves SPA navigation (no full page reload) and matches the app's routing pattern.

## 5. Risks and trade-offs

- **useCallback re-creates functions on dep change**: this is the intended behavior — the fetch re-runs exactly when its inputs change. No infinite loops because none of the fetch functions call setState that would trigger the same effect.
- **PeriodPicker deps change**: `onChange` is typically a stable callback from the parent; adding it to deps is correct. If the parent re-creates `onChange` every render, it would cause the effect to re-run — but `onChange` in this app is almost always an inline `setX` which is stable. `suggestedPeriod` is derived from `new Date()` and will change every render, causing the effect to re-run; however the `cancelled` flag and `initialized` ref prevent duplicate fetches.

## 6. Test plan

- `npm run lint` — passes with 0 warnings.
- `npm run build` — passes.
- Manual smoke test: navigate to Dashboard, Employees, Payroll, Settings, and Businesses pages and verify data loads correctly and navigation works.

## 7. Follow-ups

- The dead `formErrors` UI in Settings (never written to) should be removed in a follow-up.
- Consider extracting fetch+useEffect patterns into a shared `useFetch` hook to reduce repetition across pages.
- The `mysql2` high-severity vulnerability is a transitive dependency of Prisma 7's internal engine. It cannot be fixed without downgrading Prisma, which is out of scope per user constraint.
