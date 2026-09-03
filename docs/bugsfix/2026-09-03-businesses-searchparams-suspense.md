# Bug: Next.js 16 build fails on /businesses due to useSearchParams() outside Suspense

**Severity:** high
**Date discovered:** 2026-09-03
**Date fixed:** 2026-09-03
**Reporter:** Vercel deployment logs
**Related issue/PR:** builds on `docs/bugsfix/2026-09-03-login-searchparams-suspense.md`

---

## 1. Symptom

The Vercel deployment aborts during static page generation with:

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/businesses".
Error occurred prerendering page "/businesses".
Export encountered an error on /businesses/page: /businesses, exiting the build.
```

The build exits with code 1 and no production bundle is produced.

## 2. Reproduction

1. Push to `main`; Vercel runs `vercel build` with Next.js 16.3.4.
2. The `/businesses` page is statically rendered (`○`).
3. The build worker crashes because `useSearchParams()` is called at the
   root of the client component being prerendered.

Note: this block was *already* fixed for `/login` in
`docs/bugsfix/2026-09-03-login-searchparams-suspense.md`, but `/businesses`
was left unguarded.

## 3. Impact

- **High**: the application cannot be deployed to Vercel. Because the build
  fails, no page is reachable for any user, and the whole system is down in
  production.

## 4. Root cause

`src/app/businesses/page.tsx:51` calls `useSearchParams()` at the top level
of the default-exported client component. The only use is reading the
`drawer` query param in a `useEffect`:

```tsx
const searchParams = useSearchParams();
// ...
const drawerId = searchParams.get('drawer'); // src/app/businesses/page.tsx:106
```

In Next.js 16 App Router, `useSearchParams()` must be inside a `<Suspense>`
boundary when the page is statically generated, otherwise the prerenderer
throws a CSR bail-out error.

## 5. Fix

- Renamed the existing component `BusinessesPage` → `BusinessesPageInner`.
- Added a default-exported `BusinessesPage` wrapper that renders
  `<Suspense fallback=...><BusinessesPageInner /></Suspense>`.
- Added `Suspense` to the `react` import.

After (`src/app/businesses/page.tsx`):

```tsx
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';

function BusinessesPageInner() {
  const searchParams = useSearchParams(); // now inside Suspense - allowed
  // ...
}

export default function BusinessesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-500">Loading&hellip;</div>}>
      <BusinessesPageInner />
    </Suspense>
  );
}
```

## 6. Verification

- Ran `npx next build` locally. The build completes: "Generating static pages
  using 3 workers (34/34)" with no `useSearchParams()` error, and
  `/businesses` is listed as static (`○`) successfully.
- `npx tsc --noEmit` reports 0 errors.

## 7. Prevention

The previous fix's prevention note (grep all `src/app/**/page.tsx` for
unguarded `useSearchParams()`) was not acted on. A full audit confirms only
`src/app/businesses/page.tsx` and `src/app/login/page.tsx` use
`useSearchParams()`; both are now wrapped in Suspense. To stop this class of
bug recurring across the whole repo, add a CI guard that runs the prerender
step (a `next build` smoke job) before deploy, or an ESLint rule that flags
`useSearchParams()` calls rendered without an ancestor `<Suspense>`.
