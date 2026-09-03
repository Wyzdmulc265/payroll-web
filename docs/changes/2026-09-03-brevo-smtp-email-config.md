# Configure Brevo SMTP for password-reset emails

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

`POST /api/auth/forgot-password` delivered reset links through a
single-line `nodemailer` transport with no STARTTLS flag and a stub
HTML body. When SMTP env vars were missing, the **same** `console.info`
fallback ran in production, silently "claiming" the mail was handled
while only logging the link to the server console. The reset email
itself lacked branding, expiry, and the standard "ignore if you did not
request this" guard. Finally, the SMTP send ran **inside** the
`prisma.$transaction` callback (`src/app/api/auth/forgot-password/route.ts`),
so a slow/failed SMTP call held the DB transaction open and could roll
back the freshly-created `PasswordReset` row on error.

This blocked the one remaining 🟡 item in `AUTH-TODO.md` (Phase 10,
"Deliver reset instructions through an email provider") and contradicted
the Brevo SMTP brief in `docs/MAILER-PROMPT.md`.

See also `docs/changes/2026-09-02-email-delivery-password-reset.md`
(the original `src/lib/mail.ts` addition; this change supersedes its
"send after commit" intent, which the shipped code did not yet honor).

## 2. What changed

- `src/lib/mail.ts` now builds the transporter with
  `{ secure: false, requireTLS: true }` for Brevo port 587 STARTTLS,
  validates all five `SMTP_*` vars via `isSmtpConfigured()`, and exposes
  `redactSmtpError` to scrub `SMTP_PASS`/tokens from logs.
- A professional HTML reset template (branded, button link, expiry
  callout, "ignore if not you" warning) plus a plain-text fallback.
- Dev fallback (`console.info` of the link) is now gated on
  `NODE_ENV !== 'production'`; in production an unconfigured SMTP
  throws rather than silently logging.
- `POST /api/auth/forgot-password` now sends the email **after** the
  `PasswordReset` + `FORGOT_PASSWORD_REQUESTED` audit commit, wrapped in
  try/catch that logs (redacted) and still returns the generic 200
  (anti-enumeration).
- `.env.example`, `.env.local.example`, and `.env.production.example`
  now document the Brevo SMTP values (names + safe placeholders only).
- `docs/AUTH-IMPLEMENTATION.md` §7 + §10 updated to describe Brevo
  STARTTLS, the post-commit send, and prod-safe logging.
- Tests: new `src/lib/__tests__/mail.test.ts` (Brevo config, missing
  config dev/prod, SMTP failure, secret redaction) and extended
  `auth-flows.test.ts` (route attempts the send; expired + invalid
  token rejection).

## 3. How it works

`src/lib/mail.ts` exports:

```ts
export function isSmtpConfigured(): { configured: boolean; missing: string[] }
export function redactSmtpError(err: unknown): string
export function __resetTransporterCache(): void   // test-only
export async function sendPasswordResetEmail(to: string, token: string): Promise<void>
```

The transporter is built lazily and cached. `getTransporter()` reads
`SMTP_HOST`/`SMTP_PORT` (as a `Number`) and authenticates with
`SMTP_USER`/`SMTP_PASS`; `secure: false` + `requireTLS: true` requests
STARTTLS on connect — the correct mode for `smtp-relay.brevo.com:587`.

`sendPasswordResetEmail`:
1. Builds `resetUrl` from `NEXT_PUBLIC_APP_URL` (non-secret).
2. If SMTP is unconfigured: `console.info` the link in dev; **throw** in
   prod.
3. `from` is always `SMTP_FROM` (never `SMTP_USER`); renders HTML + text;
   calls `transporter.sendMail(...)`.

The forgot route no longer holds the DB transaction open for the send:

```ts
await prisma.$transaction(async (tx) => {
  await tx.passwordReset.create({ data: { ... } });
  await logAuditEvent({ action: 'FORGOT_PASSWORD_REQUESTED', ... }, tx);
});
try {
  await sendPasswordResetEmail(user.email, token);
} catch (mailError) {
  console.error('Failed to send password-reset email:', redactSmtpError(mailError));
}
return NextResponse.json({ success: true, data: { message: 'If the account exists, reset instructions have been sent.' } });
```

## 4. What got better

- **Correct TLS mode** for Brevo: port 587 STARTTLS (`secure:false`,
  `requireTLS:true`) instead of the implicit default.
- **No silent production failures**: an unconfigured SMTP provider in
  prod now throws server-side and is logged; the previous code logged
  the reset URL to the console in all environments.
- **No credential leakage**: `redactSmtpError` strips `SMTP_PASS` from
  every logged SMTP/conn error; reset tokens and passwords are never
  logged (they were never stored in plaintext either).
- **Anti-enumeration preserved**: the client still always sees the
  generic 200 message; only the server logs delivery failures.
- **Transaction hygiene**: a slow/failing SMTP call no longer blocks or
  rolls back the `PasswordReset` insert or its audit row.
- **Professional email**: branded button, expiry, and ignore-warning;
  plain-text fallback for clients that block HTML.
- **Test coverage**: SMTP success / missing-config (dev + prod) /
  connection failure / redaction, plus route-level expired- and
  invalid-token cases.

## 5. Risks and trade-offs

- **Generic 200 on mail failure** — intentionally kept to prevent user
  enumeration (a real account getting 200 while an unknown account would
  get 200 too). The trade-off: a user who mistypes their email in a
  system where SMTP is misconfigured receives no error. Mitigation:
  operators must monitor server logs (`Failed to send password-reset
  email`) — see `docs/changes/2026-09-03-...` follow-ups.
- **`__resetTransporterCache()` is exported** purely for test
  determinism under vitest's single-fork pool; the cache would otherwise
  leak SMTP config between tests. Marked test-only by convention.
- **No schema migration** — the `PasswordReset` model is unchanged.
- **`.env.production.example` now lists `SMTP_HOST/PORT/USER/PASS`** as
  placeholders pointing at a secret manager; these are example values,
  not committed secrets.

## 6. Test plan

```bash
npm run lint          # eslint 9
npx tsc --noEmit       # typecheck (no typecheck script in package.json)
npm test               # vitest run — includes new mail.test.ts + extended auth-flows
npm run build          # next build
```

Manual smoke (dev, SMTP unset): `POST /api/auth/forgot-password` → 200;
server console prints the reset URL. With Brevo creds set, `nodemailer`
invokes `smtp-relay.brevo.com:587` with `secure:false` + `requireTLS:true`.
All SMTP path exercised via `vi.mock('nodemailer')`; no real mail sent in
CI.

## 7. Follow-ups

- Add a health-check endpoint that calls `isSmtpConfigured()` and
  attempts a `transporter.verify()` so operators can confirm Brevo
  reachability at deploy time (suggested `docs/IMPROVEMENTS.md` entry).
- Consider a background queue for email delivery (nodemailer is still
  synchronous in the request — see original `2026-09-02` change risk
  note). The post-commit placement makes this drop-in.
- Add an e2e Playwright smoke test that submits `/forgot-password` and
  asserts the response envelope (no mail assertion in-browser).
