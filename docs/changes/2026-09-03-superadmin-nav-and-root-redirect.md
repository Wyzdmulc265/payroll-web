# SUPER_ADMIN nav and root-redirect

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

`SUPER_ADMIN` is the only role without an assigned `businessId`, but until this change the shared nav offered only **Businesses** (and the now-overridden **Audit Logs**). The platform role deserves a focused 4-tab experience: **Home · Business Management · Settings · Audit Logs**. The root URL `/` was hard-coded to `/dashboard`, which is wrong for SUPER_ADMIN.

## 2. What changed

- `src/components/MainNav.tsx:1` — adds a `SUPER_ADMIN_NAV` constant (Home, Business Management, Settings, Audit Logs) and selects it when `user.role === 'SUPER_ADMIN'`. Other roles are unchanged.
- `src/app/page.tsx:1` — server component now reads the session cookie, calls `validateSessionToken`, and redirects: SUPER_ADMIN → `/home`, others → `/dashboard`, no session → `/login`.
- `src/app/login/page.tsx:1` — `from` search param is preserved if present; otherwise the default is `/home` for SUPER_ADMIN and `/dashboard` for everyone else, based on the role returned in the login response.

## 3. How it works

The nav switch is a single conditional in the filter step:
```ts
const isSuperAdmin = user?.role === 'SUPER_ADMIN';
const visibleNav = isSuperAdmin
  ? SUPER_ADMIN_NAV
  : ALL_NAV.filter(/* permission + requiresBusiness */);
```

`MainNav` is a client component that reads the user from `UserContext`, so the role is available synchronously on the first render. The SUPER_ADMIN nav intentionally does not pass through the `requiresBusiness` filter — by definition SUPER_ADMIN has no business.

`page.tsx` uses `cookies()` from `next/headers` and the existing `validateSessionToken` helper; no new Prisma code. `redirect()` is the only output.

## 4. What got better

- **Discoverability**: the SUPER_ADMIN's capabilities (Home KPIs, Business Management, Settings, Audit Logs) are now all one click away.
- **Routing correctness**: `/` always lands on the role-appropriate landing page; unauthenticated visits still hit `/login`.

## 5. Risks and trade-offs

- The role-aware nav means SUPER_ADMIN cannot navigate to the tenant UI even by typing the URL — `/dashboard`, `/employees`, etc. all return 403 from the API. This is intentional; cross-tenant tenant data is still not accessible.
- `page.tsx` is now async (server component); the proxy still blocks unauthenticated requests, so the redirect to `/login` is mostly belt-and-suspenders.

## 6. Test plan

- Manual: visit `/` while signed in as SUPER_ADMIN → land on `/home`; while signed in as ADMIN → land on `/dashboard`; while signed out → land on `/login`.
- Manual: sidebar shows the correct 4 items for SUPER_ADMIN, the full set for ADMIN.
- New permissions test (`src/lib/auth/__tests__/permissions.test.ts`) covers the role-permission matrix.
