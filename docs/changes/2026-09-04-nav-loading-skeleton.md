# Show skeleton navigation while the session loads

**Type:** feature
**Date:** 2026-09-04
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

On every page load the nav panel rendered blank — brand header with an empty
link list and no user footer — until `GET /api/auth/me` resolved. On a cold
database connection that round-trip takes seconds, so both the tenant sidebar
and the SUPER_ADMIN nav looked broken on arrival. The panel is role-filtered,
so real links cannot render before the user is known; but *blank* is the
worst possible placeholder.

## 2. What changed

- While the session request is in flight, the sidebar shows six shimmer link
  rows plus a shimmer user footer; the mobile bottom bar shows four shimmer
  items. Real links replace them the moment the user resolves.
- `useCurrentUser()` is now tri-state: `undefined` = loading, `null` =
  unauthenticated, user object = ready. Previously loading and logged-out
  were both `null`, so the shell could not tell them apart.

## 3. How it works

- `src/components/UserContext.tsx` — initial state `undefined`; non-OK
  responses and network errors now explicitly `setUser(null)` (previously the
  state stayed at its initial value forever on failure). Context and hook
  types widened to `CurrentUser | null | undefined`.
- `src/components/MainNav.tsx` — `loadingUser = user === undefined` gates
  `animate-pulse` skeleton blocks in the desktop `<nav>`, the user footer,
  and the mobile bottom bar. The permission-filtered `visibleNav` logic is
  untouched; skeletons are `aria-hidden` so assistive tech skips them.
- No consumer changes needed: `users`, `settings`, and `audit-logs` pages
  all read the user via optional chaining (`user?.role`), which treats
  `undefined` exactly like `null`.

## 4. What got better

- **Before:** blank nav panel for the full `/api/auth/me` latency on every
  load (both tenant and SUPER_ADMIN variants).
- **After (qualitative):** the panel immediately shows its shape with
  shimmer placeholders, then populates — the standard perceived-performance
  pattern. Actual request latency is unchanged.

## 5. Risks and trade-offs

- This masks latency rather than removing it; if `/api/auth/me` itself is
  slow (Neon cold start), a follow-up could warm/persist the session lookup.
  Skeletons cap at the same visual footprint as real content, so no layout
  shift when links resolve.
- Any future `useCurrentUser()` consumer must handle `undefined` (loading)
  distinctly from `null` where it matters; optional chaining covers the
  display cases.

## 6. Test plan

- `npx tsc --noEmit` — clean (tri-state flows through all four consumers).
- `npx eslint` on both touched components — clean.
- Manual: hard-refresh `/dashboard` (tenant) and `/home` (SUPER_ADMIN) with
  throttled network — skeleton rows appear instantly, real links replace
  them; auth pages (`/login`) still render with no nav.

## 7. Follow-ups

- Consider prefetching `/api/auth/me` earlier (e.g. route-level) or caching
  the role client-side to shorten the skeleton window.
- Same blank-while-loading audit for page-level spinners is out of scope.
