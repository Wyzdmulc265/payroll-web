# Add Demo Account Quick-Fill to Login Page

**Type:** feature  
**Date:** 2026-09-10  
**Related issue/PR:** none

---

## 1. Why

The seed creates three hardcoded demo accounts (`ADMIN`, `PAYROLL_OPERATOR`, `VIEWER`) in `prisma/seed.ts:64–70`, but there is no shortcut for a user to log in with them. A new user (or a stakeholder doing a demo) must manually type or copy-paste credentials. Adding a one-click "Demo Accounts" section removes that friction and makes the demo intent explicit.

## 2. What changed

- A new "Demo Accounts" row of three buttons (Admin, Operator, Viewer) appears on the login page between the password field and the Sign in button.
- Clicking a button auto-fills the email, password, and business name fields with the corresponding seeded demo credentials.
- The submit button label updates to "Sign in as Admin/Operator/Viewer" when a demo is staged.
- Manually editing any field clears the staged demo selection and reverts the submit label to "Sign in".
- No changes to credentials, the seed, or any backend route.

## 3. How it works

- `DEMO_ACCOUNTS` constant (`src/app/login/page.tsx:8–12`) mirrors the three seeded accounts from `prisma/seed.ts:64–70` with matching emails, passwords, and business names.
- `selectedDemo` state (`src/app/login/page.tsx:28`) tracks the currently staged demo role.
- `fillDemo` handler (`src/app/login/page.tsx:41–48`) populates the three form fields, clears errors, and sets `selectedDemo`.
- The three `onChange` handlers (`src/app/login/page.tsx:155`, `178`, `202`) reset `selectedDemo` to `null` on manual edits.
- Demo buttons (`src/app/login/page.tsx:233–250`) use the existing `.btn-secondary` style; the active button gets a `ring-2 ring-primary` highlight.
- Submit label (`src/app/login/page.tsx:266`) reads `DEMO_ACCOUNTS.find((a) => a.role === selectedDemo)?.label` when a demo is active.

## 4. What got better

- **Onboarding speed:** a new user can log in as any demo role in one click instead of hunting for credentials.
- **Demo clarity:** the role label on the submit button makes it obvious which persona is about to log in.
- **No regressions:** existing login flow, rate limiting, and error handling are untouched.

## 5. Risks and trade-offs

- Demo credentials remain hardcoded in the client bundle. This is acceptable because they are already public in `prisma/seed.ts`; obscuring them client-side would provide no real security benefit for seeded test accounts.
- SUPER_ADMIN is intentionally excluded — its credentials come from environment variables (`BOOTSTRAP_SUPER_ADMIN_EMAIL` / `BOOTSTRAP_SUPER_ADMIN_PASSWORD`) and are not stable across environments.

## 6. Test plan

- `npm run lint` passes (0 errors).
- Manual: open `/login`, click each demo button — fields populate, submit label updates, login succeeds.
- Manual: after staging a demo, manually edit email — submit label reverts to "Sign in".
- Existing E2E smoke tests (`e2e/smoke/auth.spec.ts`) are unchanged and continue to pass.

## 7. Follow-ups (optional)

- Add a "Demo Accounts" hint on the login page heading or subtitle to make the feature more discoverable.
- Consider a query-param shortcut (e.g. `/login?demo=ADMIN`) for shareable demo links.
