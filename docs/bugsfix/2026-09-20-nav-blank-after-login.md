# Nav fails to load after successful sign-in

**Type:** bugsfix
**Date:** 2026-09-20
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Symptom

Immediately after a successful sign-in, the persistent navigation panel fails to
load — the sidebar shows either an empty link list with no user footer, or the
shimmer loading skeleton that never resolves. The user is genuinely
authenticated (they can reach `/dashboard`), but the nav "tab" stays blank on
the page they land on after logging in. A direct visit / hard refresh of
`/dashboard` afterwards correctly shows the nav.

## 2. Reproduction

1. Start the app with a seeded database (see `prisma/seed.ts`).
2. Open `/login`, enter a valid account (e.g. `admin-a@testbiz.local` /
   `AdminTest123`), submit.
3. `LoginPage` issues `router.push('/dashboard')` on success —
   `src/app/login/page.tsx:93-98`.
4. Observe: the dashboard loads but the nav is blank / stuck on skeleton.

The bug is **path-dependent**. It only reproduces when arriving at the protected
page via a *client-side* `router.push` from the login page. Landing on
`/dashboard` by direct navigation (address bar, hard refresh) does **not**
reproduce it — which is why a no-cache Vercel redeploy appeared to "fix then
regress" intermittently. The bug is in the client navigation path, not the
build or the deployment cache.

## 3. Impact

- Every sign-in via the UI lands the user on a page with a broken nav until
  they refresh. This is the first screen after auth, so it is high-visibility
  (recurred after being reported fixed; see §7).
- Only the *visual* shell is affected; the session itself is valid, so there is
  no security/data impact.

## 4. Root cause

`src/components/UserContext.tsx` populated its `user` state from the
server-rendered `initialUser` prop, which `src/app/layout.tsx` computes by
reading the session cookie (`layout.tsx:30-40`). This works for a **direct**
page load. But after login the redirect is a **client-side** `router.push`, and
Next.js App Router does **not re-render the root layout** when navigating
between routes that share it (`/login` and `/dashboard` both live under the
root `src/app/layout.tsx`). The Next.js 16 docs state this explicitly
(`node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`):

> "Client navigations only re-render below the layout the current and
> destination routes share."

Consequences on the post-login page:

- `UserProvider`'s `useState(initialUser ?? undefined)` captured its value once
  at **mount**, which happened on `/login` where the server had no session →
  `null`.
- The old sync effect short-circuited with `if (initialUser !== undefined)
  return;` — on `/login` `initialUser` is `null` (not `undefined`), so the
  `/api/auth/me` fetch was **skipped** and the state stayed `null` forever. And
  even if it had fetched, nothing re-triggered it after the client navigation,
  because the root layout — and therefore the `initialUser` prop — never
  updated.

So `MainNav` saw `user === null` → `visibleNav` filtered to `[]`, or `user ===
undefined` → `loadingUser === true` → stuck skeleton.

History: `initialUser` was introduced by `e8cab9c` ("nav load fix"); later
`layout.tsx` churn (`1c63e41`, `c9b39ac`) touched fonts but not this logic, so
the stale-state defect silently persisted and kept re-manifesting. The e2e test
meant to catch it (`e2e/smoke/auth.spec.ts`) was silently broken because it
still referenced pre-isolation seed emails (`admin@testbiz.local`) that no
longer exist after `2026-09-10-two-business-seed-isolation.md`.

## 5. Fix

`src/components/UserContext.tsx`:

1. Seed state directly from `initialUser` (`useState(initialUser)` instead of
   `initialUser ?? undefined`), so a **direct** page load with a valid session
   renders the user/nav immediately with no fetch.

2. Self-heal from the session cookie on protected pages. A client-side
   `router.push` after login does not re-supply `initialUser` (the root layout
   stays mounted), so whenever we land on a non-auth route while `user` is
   still unknown, re-resolve via `/api/auth/me` (which reads the actual
   cookie). This also covers `router.refresh()` after login, where state is
   retained but the prop is not:

   ```tsx
   const onProtectedPage = !isAuthPath(pathname);
   useEffect(() => {
     if (!onProtectedPage || user) return;
     let active = true;
     fetch('/api/auth/me', { credentials: 'same-origin' })
       .then((res) => (res.ok ? res.json() : null))
       .then((json) => {
         if (!active) return;
         setUser(json?.success && json?.data ? (json.data as CurrentUser) : null);
       })
       .catch(() => { if (active) setUser(null); });
     return () => { active = false; };
   }, [onProtectedPage, user]);
   ```

   Where `isAuthPath` excludes `/login`, `/forgot-password`, `/reset-password/*`
   (no fetch needed; nav is hidden there). `pathname` comes from the
   client-component-safe `usePathname()` hook, so the effect re-fires when the
   route changes across the login boundary.

This makes the nav load correctly no matter how the user arrives: direct
navigation, client-side `router.push`, or `router.refresh()`. (A React 19
effect that synchronously mirrored `initialUser` into state was considered and
rejected as redundant — every path that changes the user also leaves `user`
falsy on a protected page, which the self-heal fetch already resolves.)

## 6. Verification

- `e2e/smoke/auth.spec.ts` — repaired and extended. Constants updated to the
  current seeded accounts (`admin-a@testbiz.local`, `operator-a@testbiz.local`),
  and the login test now asserts the nav links render, not only the email
  footer:
  `await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();`
  Under the old code this test fails (nav stays blank); under the fix it passes.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- Manual repro (§2) no longer triggers the blank nav.

## 7. Prevention

- The regression guard test (`valid admin login ... loads the nav`) now
  actually runs and asserts visible nav links, so this exact breakage is
  caught by the e2e suite going forward. Keep the e2e seed constants in sync
  with `prisma/seed.ts` when accounts change.
- Consider a future hardening pass: stop expecting a client context to receive
  a refreshed server prop across navigations at all. The canonical fix is for
  the auth UI to treat `/api/auth/me` (cookie-backed) as the single client-side
  source of truth, which is what this change moves toward.