# Fix Next.js 16 build failure: useSearchParams() requires Suspense on /login

**Date:** 2026-09-03
**Type:** bugfix
**Priority:** high

## Context

The Vercel deployment fails during static page generation:

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/login".
```

Next.js 16 (App Router) does not allow `useSearchParams()` to be called at the
top level of a client component during prerendering. It must be inside a
`<Suspense>` boundary.

Only one file is affected:
- `src/app/login/page.tsx` — line 10 calls `useSearchParams()` at the root of
  the exported component.

## Plan

1. Edit `src/app/login/page.tsx`:
   - Extract the body of the current default export into a new inner
     `function LoginForm()`.
   - Move `useSearchParams()`, all state, `useEffect`, and `handleSubmit` into
     `LoginForm`.
   - Make the exported `LoginPage` a thin wrapper that renders
     `<Suspense fallback={...}><LoginForm /></Suspense>`.
   - The fallback renders the same brand header (logo + title) so the layout
     does not shift while search params are resolving.

2. Add docs/bugsfix/2026-09-03-login-searchparams-suspense.md describing the
   symptom, root cause, and fix.

3. Run `npm run build` locally to confirm the error is gone.

## Notes

- No other files use `useSearchParams()` (verified with repo-wide grep).
- No runtime behavior changes; the form logic is identical.
- This unblocks the Vercel deployment.
