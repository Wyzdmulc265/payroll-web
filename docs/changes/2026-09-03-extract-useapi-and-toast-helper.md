# Extract `useApi` hook and `useToast` helper, replace `alert()`

**Type:** refactor
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#25`

## 1. Why

Multiple pages used `window.alert()` for non-destructive errors and
success feedback. This blocks the main thread, looks unprofessional,
and is inconsistent with the settings page's existing toast system.

## 2. What changed

- Added `src/hooks/useApi.ts` — a generic fetch wrapper returning
  `{ data, error, isLoading, request, reset }`.
- Added `src/hooks/useToast.tsx` — a minimal toast notification hook
  with a `<Toast />` component.
- Replaced `alert(...)` in `employees/page.tsx`, `settings/page.tsx`,
  `payroll/page.tsx`, and `users/page.tsx` with `showToast(...)`.
- Destructive-action confirms (`confirm(...)`) are preserved.

## 3. How it works

```ts
const { showToast, Toast } = useToast();
// ...
showToast('Employee deactivated');
// ...
<TToast />
```

`useApi` centralises error handling and loading state for any
`fetch()` call.

## 4. What got better

| Before | After |
|--------|-------|
| Blocking `alert()` modals. | Non-blocking toast notifications. |
| Inline fetch + error handling duplicated per page. | Shared `useApi` hook. |

## 5. Risks and trade-offs

- Toasts auto-dismiss after 3 seconds. Long error messages may be
  truncated. A follow-up can add a "Details" expand.

## 6. Test plan

- Manual: trigger each toast path (success, error, network error) and
  verify the message appears and auto-dismisses.

## 7. Follow-ups

- Migrate remaining `alert()` calls in other pages (if any).
- Add a `useConfirm` hook to replace `window.confirm()` with a
  styled modal.
