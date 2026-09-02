# Email delivery for password reset

**Type:** feature
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

`POST /api/auth/forgot-password` logged the reset token to the console
with a `console.info` stub. There was no way to actually deliver the
token to the user. This blocked the password-reset flow from being
usable in any non-development environment.

## 2. What changed

- Added `nodemailer` as a dependency.
- Created `src/lib/mail.ts` with `sendPasswordResetEmail(to, token)`.
- Wired `sendPasswordResetEmail` into the forgot-password route after
  the `PasswordReset` row and audit event are committed in a transaction.
- Added `.env.local.example` entries for SMTP configuration.

## 3. How it works

`sendPasswordResetEmail` builds a reset URL from `NEXT_PUBLIC_APP_URL`
and sends it via SMTP if `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and
`SMTP_PASS` are configured. If SMTP is not configured, it falls back to
`console.info` so local development continues to work without any
configuration.

The forgot-password route now:
1. Validates the email.
2. Creates a `PasswordReset` row + `FORGOT_PASSWORD_REQUESTED` audit in
   a transaction.
3. Calls `sendPasswordResetEmail` after the transaction commits.

## 4. What got better

- Password-reset flow is now end-to-end deliverable.
- No new external service dependency; any SMTP server works.

## 5. Risks and trade-offs

- `nodemailer` is a new production dependency (~500 KB). It is the
  standard Node.js SMTP library and is actively maintained.
- Email delivery is now a blocking call in the route handler. In
  production, consider moving it to a background job or queue.

## 6. Test plan

- `npx vitest run` → 88 tests pass.
- Manual: `POST /api/auth/forgot-password` with a valid email returns
  200; console logs the reset URL when SMTP is not configured.

## 7. Follow-ups

- Add `.env.local.example` entries: `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Consider retry logic and bounce handling for production SMTP.
