# Add Phase 6 Login UI and Request Proxy

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

The authentication API foundation (models, sessions, logic) was completed, but there was no user interface to actually log in. Furthermore, Next.js was allowing unauthenticated browsers to access the application pages (like `/dashboard` and `/payroll`), which then crashed or errored out when their internal API calls returned 401 Unauthorized. We needed the frontend boundary to enforce sessions and provide the authentication UX.

## 2. What changed

- Added `src/proxy.ts` (Next.js 16's renamed `middleware.ts`) to intercept all incoming requests. It redirects unauthenticated browser requests to `/login` and returns 401 for unauthenticated API requests.
- Added `/login`, `/forgot-password`, and `/reset-password/[token]` pages.
- Added a `UserProvider` React Context that fetches the current user session once on mount.
- Updated `MainNav` to conditionally render nothing on auth pages, and otherwise to display navigation links filtered by the user's role.
- Added a user footer to `MainNav` displaying the logged-in email, role, and a functional logout button.

## 3. How it works

- **Proxy:** `src/proxy.ts` checks the `payroll_session` cookie. It operates purely at the edge/Node boundary without invoking Prisma, since full session validation happens in the route handlers. Public paths like `/login` are allowed through unconditionally.
- **Client context:** `src/components/UserContext.tsx` fetches `/api/auth/me`. The RootLayout wraps `MainNav` and the children in `UserProvider`.
- **Auth hiding:** Because `MainNav` is now a Client Component taking `children`, it inspects the `pathname` and returns just `<>{children}</>` if the user is on an auth page, preventing the sidebar and layout offsets from rendering.

## 4. What got better

- **Security:** The application is now correctly walled off. Unauthenticated visitors cannot access protected routes or pages.
- **UX:** Full-page login, forgot password, and reset password flows exist with client-side validation, error handling, and rate-limit countdowns.
- **Role-based visibility:** Users only see the navigation items they are permitted to access (e.g., a VIEWER cannot see the Settings nav item).

## 5. Risks and trade-offs

- The proxy does not validate the session token against the database (by design). A user with a revoked but unexpired cookie might briefly see the dashboard UI frame before the API calls fail and force a redirect. This is a standard trade-off for edge middleware performance.
- The Next.js 16 breaking change from `middleware` to `proxy` was adopted successfully.

## 6. Test plan

- `npx tsc --noEmit` and Vitest pass.
- Manual testing:
  - Access `/dashboard` without a session -> Redirected to `/login?from=/dashboard`.
  - Log in with valid credentials -> Redirected back to `/dashboard`.
  - Check `MainNav` to ensure role-appropriate links are displayed.
  - Click logout -> Redirected to `/login`.

## 7. Follow-ups (optional)

- Add Playwright browser smoke tests for the login, redirect, and logout flows (Phase 6 final item). Done in `docs/changes/2026-09-02-browser-smoke-tests.md`.
