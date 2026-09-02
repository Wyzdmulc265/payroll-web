# Browser smoke tests (Playwright)

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

No browser-level tests existed. A regression in the login form, session
cookie, or redirect logic could ship undetected.

## 2. What changed

- Installed `playwright` and `@playwright/test` as dev dependencies.
- Created `e2e/smoke/auth.spec.ts` covering:
  - Unauthenticated access to `/dashboard` → redirects to `/login`.
  - `/login` page renders email/password fields.
  - Invalid credentials → 401 error shown.
  - Valid credentials → redirects to `/dashboard`, nav shows email.
  - Logout → redirects to `/login`, session cookie cleared.
  - VIEWER user does not see Settings nav item.
- Created `e2e/playwright.config.ts` with base URL `http://localhost:3000`.

## 3. How it works

Playwright launches a Chromium browser against the dev server. The
spec uses the seeded test accounts (`admin@testbiz.local` /
`AdminTest123`, `viewer@testbiz.local` / `ViewerTest123`).

## 4. What got better

- Critical login/logout flow is covered at the browser level.
- Regression in auth UI or cookie handling will fail CI.

## 5. Risks and trade-offs

- Playwright downloads a Chromium binary (~200 MB) on first run.
- Tests require a running dev server (`npm run dev`).

## 6. Test plan

- `npm run dev` in one terminal.
- `npx playwright test e2e/smoke/auth.spec.ts` in another.
- All 6 smoke tests pass.

## 7. Follow-ups

- Add smoke tests for employee CRUD and payroll run.
- Run Playwright in CI (GitHub Actions).
