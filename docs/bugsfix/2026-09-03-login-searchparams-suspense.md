# Bug: Next.js 16 build fails on /login due to useSearchParams() outside Suspense

**Severity:** high
**Date discovered:** 2026-09-03
**Date fixed:** 2026-09-03
**Reporter:** Vercel deployment logs
**Related issue/PR:** none

---

## 1. Symptom

The Vercel deployment fails during static page generation with:

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/login".
```

The build aborts and no production bundle is produced.

## 2. Reproduction

1. Run `npm run build` with Next.js 16.3.4 in an environment that performs
   prerendering (Vercel Edge, `next build` locally).
2. The `/login` page is statically rendered.
3. The build worker crashes because `useSearchParams()` is called at the root
   of a client component that is being prerendered.

## 3. Impact

- **High**: the application cannot be deployed to Vercel. No users can reach
  any page because the build does not complete.
- The login page is the only affected route, but it is the entry point for
  every user.

## 4. Root cause

`src/app/login/page.tsx:10` calls `useSearchParams()` at the top level of the
default exported `LoginPage` client component. In Next.js 16 App Router,
`useSearchParams()` must be wrapped in a `<Suspense>` boundary when the page
is statically generated, otherwise the prerenderer throws a CSR bail-out
error.

## 5. Fix

- Extracted the form UI into a new inner `function LoginForm()`.
- Moved `useSearchParams()`, all state, `useEffect`, and `handleSubmit` into
  `LoginForm`.
- Made the exported `LoginPage` a thin wrapper that renders
  `<Suspense fallback={...}><LoginForm /></Suspense>`.
- The fallback renders the same brand header (logo + title) so the layout
  does not shift while search params are resolving.

Before (`src/app/login/page.tsx`):

```tsx
export default function LoginPage() {
  const searchParams = useSearchParams(); // line 10 - throws during prerender
  ...
}
```

After (`src/app/login/page.tsx`):

```tsx
function LoginForm() {
  const searchParams = useSearchParams(); // now inside Suspense - allowed
  ...
}

export default function LoginPage() {
  return (
    <Suspense fallback={<BrandHeader />}>
      <LoginForm />
    </Suspense>
  );
}
```

## 6. Verification

- Ran `npm run build` locally. The build completes successfully and no
  `useSearchParams()` prerender error is emitted.
- Manually verified `/login` in the browser: the page renders identically,
  including `?from=` and `?reset=1` query-param behavior.

## 7. Prevention

- Audit other pages for unguarded `useSearchParams()` calls (grep across
  `src/app/**/page.tsx`).
- Consider adding an ESLint rule or a CI build step that catches Next.js
  prerender errors before they reach Vercel.
