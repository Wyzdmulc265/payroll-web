# Plan: Configure Brevo SMTP for Password-Reset Emails

**Goal:** Wire the existing password-reset flow to Brevo's SMTP relay
(`smtp-relay.brevo.com:587` / STARTTLS) using server-side env vars, add
startup/runtime validation, harden error handling + template, and add
mocked SMTP tests — **without touching the hand-rolled auth system**.

**Plan file:** `2026-09-03-brevo-smtp-email-config-plan.md` (this file)

---

## 1. Findings (do not re-discover during implementation)

- **Auth is custom** — no NextAuth/Auth.js. Session tokens are 32-byte
  hex; reset tokens are 32-byte hex hashed with SHA-256 at rest; 1-hour
  expiry; single-use (`PENDING → USED`); password change invalidates
  all user sessions. (`docs/AUTH-IMPLEMENTATION.md §7`,
  `src/app/api/auth/reset-password/route.ts`)
- **Sole email module:** `src/lib/mail.ts` — 43 lines. Lazy cached
  `nodemailer.createTransport({ host, port, auth })` with **no**
  `secure`/`requireTLS`. Falls back to `console.info(resetUrl)` when any
  SMTP env var is missing — **same code path in dev and prod**.
- **Caller:** `src/app/api/auth/forgot-password/route.ts:25` calls
  `sendPasswordResetEmail` **inside** the `prisma.$transaction` callback
  (`src/app/api/auth/forgot-password/route.ts:17–35`). A slow/failed SMTP
  send holds the DB transaction open and would roll back the token row.
  (`docs/changes/2026-09-02-email-delivery-password-reset.md` §5 notes
  the original intent was "after the transaction commits"; the shipped
  code does not match.)
- **Template:** one-line HTML paragraph + bare URL as `text`. No
  branding, button, expiry callout, or "ignore if not you" warning.
- **No SMTP validation** anywhere; no email tests at all
  (`grep` for `nodemailer|sendPasswordReset|getTransporter` in
  `*.test.ts` → 0 hits).
- **Env examples:** `.env.example`, `.env.local.example`,
  `.env.production.example` — all tracked (gitignored set is
  `.env`, `.env.local`, `.env*.local` only).
- **Scripts:** `npm test` (`vitest run`, single fork), `npm run lint`
  (eslint 9), `npm run build` (next build). No `typecheck` script;
  `npx tsc --noEmit` available via local `typescript`.
- **Convention:** `@/...` alias → `src/`; API envelope
  `{ success, data?, error?, details? }`; errors never leak internals.

---

## 2. Out of scope (preserved unchanged)

- `src/lib/auth/*` — session/password/token/permissions/rate-limit/auth
  schemas. **Do not modify.**
- `src/app/api/auth/reset-password/route.ts` — already satisfies
  4.2–4.8 and 8.3–8.4 (verifies hash+expiry+status, rotates password,
  marks `USED`, invalidates sessions). **No change required.**
- `src/app/proxy.ts`, login/logout/me pages, `UserContext.tsx`.
- No NextAuth, no new auth deps, no schema migration, no frontend env
  exposure (confirm: no `VITE_` anywhere; only `NEXT_PUBLIC_APP_URL`
  touches the client and is not secret).

---

## 3. Files to change (ordered)

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/mail.ts` | Refactor: STARTTLS config, template, validation, error handling, dev/prod split, testable transporter reset |
| 2 | `src/app/api/auth/forgot-password/route.ts` | Move `sendPasswordResetEmail` **after** `prisma.$transaction`; add try/catch around the send with server-side error logging |
| 3 | `src/lib/__tests__/mail.test.ts` | **New** — mocked SMTP tests (Brevo config, missing-config, auth failure, dev fallback) |
| 4 | `src/lib/auth/__tests__/auth-flows.test.ts` | Add assertions that `forgot-password` returns 200 + attempts send; extend expired/invalid-token coverage |
| 5 | `.env.example` | Update SMTP section for Brevo placeholders |
| 6 | `.env.local.example` | Update SMTP block for Brevo |
| 7 | `.env.production.example` | Add full `SMTP_*` set (host/port/user/pass/from) |
| 8 | `docs/AUTH-IMPLEMENTATION.md` | §7 + §9: note Brevo STARTTLS + prod-safe logging |
| 9 | `docs/changes/2026-09-03-brevo-smtp-email-config.md` | **New** — mandatory per `AGENTS.md` + `docs/AI-DOCUMENTATION-INSTRUCTIONS.md` |

---

## 4. Detailed change specs

### 4.1 `src/lib/mail.ts` (full rewrite, keep `sendPasswordResetEmail` signature)

Key invariants the new version must satisfy:
- Export `sendPasswordResetEmail(to: string, token: string): Promise<void>`
  unchanged signature so the route import stays valid.
- Transporter options: `{ host, port, secure: false, requireTLS: true,
  auth: { user, pass } }` — matches the prompt's `{ secure: false }` and
  Brevo's port-587 STARTTLS requirement.
- `from` **always** `process.env.SMTP_FROM`; never derive from `SMTP_USER`.
- Reset URL base from `process.env.NEXT_PUBLIC_APP_URL ??
  'http://localhost:3000'` (keep; it is non-secret and already there).
- **Dev fallback:** when SMTP is unconfigured **and**
  `process.env.NODE_ENV !== 'production'`, `console.info` the reset URL
  (preserve existing local-dev behavior the prompt permits).
- **Prod fail-closed:** when SMTP is unconfigured **and** in production,
  throw an `Error('SMTP configuration is incomplete; ...')` so the route
  can decide. Do **not** log the URL in prod.
- On `sendMail` rejection: throw, preserving the error for the caller's
  logging. Never log `SMTP_PASS`/token.
- Add `isSmtpConfigured()` (returns `{ configured, missing: string[] }`)
  for testability and reuse by the route. Throw a clear message listing
  the **names** of missing vars only (never values).
- Add an internal reset: `export function __resetTransporterCache()` that
  clears `cachedTransporter` so tests can set env vars per-case. Mark
  clearly as test-only; the implementer should confirm the team is OK
  exporting a dunder, else use `vi.resetModules()` in the test file
  instead. **Recommended:** export it guarded — tests need deterministic
  config without process-global leakage (single-fork pool).

Exact skeleton (implementer fills brand tokens / colors to house style):

```ts
import nodemailer from 'nodemailer';
import { z } from 'zod';         // already a dep; use for env validation

const REQUIRED_SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;

export function isSmtpConfigured(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_SMTP_VARS.filter((v) => !process.env[v]);
  return { configured: missing.length === 0, missing };
}

type MailTransporter = nodemailer.Transporter<nodemailer.SendMailOptions> | undefined;
let cachedTransporter: MailTransporter | null = null;

export function __resetTransporterCache(): void {
  cachedTransporter = null;
}

function getTransporter(): MailTransporter {
  if (cachedTransporter !== null) return cachedTransporter;
  const { configured, missing } = isSmtpConfigured();
  if (!configured) {
    cachedTransporter = undefined;
    return undefined;
  }
  const port = Number(process.env.SMTP_PORT);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: false,            // STARTTLS on port 587
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransporter;
}

const APP_NAME = 'Payroll System';           // keep neutral; matches SMTP_FROM phrasing
const TOKEN_TTL_LABEL = '1 hour';            // keep in sync with route (60 min)

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password/${token}`;

  const { configured, missing } = isSmtpConfigured();

  if (!configured) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[mail] SMTP not configured — password reset link for ${to}: ${resetUrl}`);
      return;
    }
    throw new Error(
      'SMTP configuration is incomplete; cannot send email. ' +
      `Missing: ${missing.join(', ')}`,
    );
  }

  const from = process.env.SMTP_FROM!;
  const transporter = getTransporter();

  const html = renderResetHtml({ appName: APP_NAME, resetUrl, expiry: TOKEN_TTL_LABEL });
  const text = renderResetText({ appName: APP_NAME, resetUrl, expiry: TOKEN_TTL_LABEL });

  await transporter!.sendMail({
    from,
    to,
    subject: `Reset your ${APP_NAME} password`,
    text,
    html,
  });
}
```

`renderResetHtml` / `renderResetText` are pure helpers (extract so tests
can assert on content without nodemailer). Template requirements (req 5)
all met:
- application name (APP_NAME)
- "a password reset was requested"
- prominent button/link (HTML `<a>` styled as button)
- expiry info ("expires in 1 hour")
- "ignore this email if you did not request a reset"
- plain-text fallback (`text`)

**Design decision — report for confirmation:** when SMTP send fails in
production, the forgot route should **still return the generic 200
"if the account exists…"** to prevent user enumeration, but
**log the SMTP error loudly** server-side (this satisfies "do not
silently claim" — the failure is not silent to operators). See §6.2.

### 4.2 `src/app/api/auth/forgot-password/route.ts`

Move the send **outside** the transaction and wrap in try/catch:

```ts
await prisma.$transaction(async (tx) => {
  await tx.passwordReset.create({ data: { userId: user.id, tokenHash, expiresAt } });
  await logAuditEvent({ ... }, tx);      // audit + token committed together
});
// <-- transaction committed; now attempt delivery (do NOT hold DB tx)
try {
  await sendPasswordResetEmail(user.email, token);
} catch (mailError) {
  // Never leak SMTP errors / which account failed to the client (anti-enumeration).
  console.error('Failed to send password-reset email:', maskMailError(mailError));
  // Token row is already committed, so the user can still reset if an
  // operator retries delivery; do NOT roll back.
}
```

- `maskMailError` ensures no `SMTP_PASS`/token appears in logs — log
  `error.message` and a redacted `error.code` only. Implement as a small
  helper in `mail.ts` (`redactSmtpError`) or inline; recommend inline in
  `mail.ts` so all callers benefit.
- Keep the 200 generic response unchanged for both existing and unknown
  users (anti-enumeration, req 4.6).
- Keep the `if (user?.status === 'ACTIVE')` guard.

### 4.3 New: `src/lib/__tests__/mail.test.ts`

Use `vi.mock('nodemailer')` to return a fake transporter with a
`sendMail` spy. Co-located `__tests__` matching the existing tree
convention. Cases:

1. **Successful send → Brevo config** — set
   `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, user/pass/from;
   call `sendPasswordResetEmail`; assert `createTransport` called with
   `{ host, port: 587, secure: false, requireTLS: true, auth }` and
   `sendMail` called with `from === SMTP_FROM`, correct subject/line,
   HTML contains reset URL + expiry + ignore warning, `text` is plain.
2. **Missing SMTP config (dev)** — clear all `SMTP_*`;
   `NODE_ENV=development`; expect `console.info` called with the URL
   and `sendMail` **not** called.
3. **Missing SMTP config (prod)** — `NODE_ENV=production`; expect the
   function to **reject** and not log the URL.
4. **SMTP auth/connection failure** — mock `sendMail` to reject; expect
   `sendPasswordResetEmail` to rethrow and **no URL/token in the
   thrown error** (masking verified).
5. **Unknown email safe response** — covered by route-level test in
   `auth-flows.test.ts` (already passes); no mail spy assertions needed.

Each test calls `__resetTransporterCache()` in `beforeEach` and sets env
via `vi.stubEnv`.

### 4.4 Extend `src/lib/auth/__tests__/auth-flows.test.ts`

- Add a `vi.mock` of `nodemailer` at the top (spy `sendMail`).
- In the existing "forgot issues a hashed one-time token…" test, assert
  the send spy **was called** with `from === process.env.SMTP_FROM ?? 'no-reply@example.com'`
  and HTML containing the reset URL — proving the route calls the mailer.
- Add: **expired token rejected** — mutate the `PasswordReset.expiresAt`
  to the past, POST reset → 400.
- Add: **invalid token rejected** — POST reset with a bogus token → 400.
- (Reuse covered; unknown-email → 200 already covered on line 140–145.)

---

## 5. Environment validation strategy

- `isSmtpConfigured()` is the single source of truth — used by
  `getTransporter()` and directly testable.
- The prompt asks for "startup or runtime" errors. Next.js server code
  here runs per-request (not a long-lived startup), so **runtime**
  validation in `getTransporter`/`isSmtpConfigured` is the correct
  mechanism. No top-level module throw (would break `next dev`).
- Missing-vars error message lists **names only**, never values:
  `"Missing: SMTP_HOST, SMTP_PASS"`.
- Never print `SMTP_PASS`, Brevo keys, reset tokens, or passwords anywhere.

---

## 6. Design decisions (flag for confirmation)

1. **Anti-enumeration vs. "not silently claiming"** — recommended: always
   return generic 200 to the client; log SMTP failures loudly on the
   server. This is the industry-standard trade-off and honors both
   reqs 4.6 and 6. *(If the team prefers a 500 on email failure in prod,
   that would leak account existence when SMTP is down — not recommended.)*
2. **`__resetTransporterCache()` export** — needed for deterministic tests
   under the single-fork pool. Alternatively `vi.resetModules()` per test.
   Implementer may pick; plan assumes the export approach.
3. **Send outside the transaction** — fixes the tx-hold bug noted in
   `docs/changes/2026-09-02-email-delivery-password-reset.md` §5. Token
   row commits first, then email is attempted; a send failure does not
   invalidate the already-created token.
4. **HTML template** — use an inline-styled, single-cell table button
   (highest email-client compatibility). Colors/brand left to implementer
   to match house style; neutral defaults provided.

---

## 7. Validation / test plan

Run from repo root, all must pass:

```bash
npm run lint          # eslint 9
npx tsc --noEmit       # typecheck (no typecheck script exists)
npm test                # vitest run — new mail.test.ts + extended auth-flows
npm run build          # next build succeeds
```

Manual smoke (dev, SMTP unset): `POST /api/auth/forgot-password` with a
known-active email → 200; server console prints the reset URL. With SMTP
env set to a Brevo sandbox/credentials, verify `sendmail` is invoked
with `secure:false` + `requireTLS:true`.

Never in CI: do **not** set real `SMTP_PASS`. All SMTP path exercised via
the `vi.mock('nodemailer')` spy.

---

## 8. Docs deliverable (mandatory)

Per `AGENTS.md` + `docs/AI-DOCUMENTATION-INSTRUCTIONS.md §3`, this change
must ship with a `docs/changes/` file using the §3 template:
`docs/changes/2026-09-03-brevo-smtp-email-config.md` with sections
Why / What changed / How it works / What got better / Risks / Test plan /
Follow-ups. Also update `docs/AUTH-IMPLEMENTATION.md` §7 + §9. The
implementer writes the doc file from this plan (same commit as the code).

### Env-example edits (summary)

`.env.example` SMTP block →

```env
# SMTP (Brevo) — password reset / notifications
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT="587"
SMTP_USER="your_brevo_smtp_login"
SMTP_PASS="your_brevo_smtp_key"
SMTP_FROM="Payroll System <your-verified-sender-email>"
```

`.env.local.example` SMTP block → same (uncommented, dev placeholders).

`.env.production.example` → add full `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS`
alongside the existing `SMTP_FROM`, with a comment that values come from
a secret manager and none are committed.

---

## 9. Task list for the implementation agent

- [ ] 1. Rewrite `src/lib/mail.ts`: STARTTLS transporter, `isSmtpConfigured()`,
      `redactSmtpError`, improved HTML+text template, dev/console vs prod/throw
      split, `__resetTransporterCache()` export.
- [ ] 2. Edit `src/app/api/auth/forgot-password/route.ts`: move
      `sendPasswordResetEmail` out of the `$transaction`; try/catch with
      `redactSmtpError` logging; keep 200 generic response.
- [ ] 3. Create `src/lib/__tests__/mail.test.ts` with the 4 mocked cases.
- [ ] 4. Extend `auth-flows.test.ts`: assert send was attempted; add
      expired-token and invalid-token cases.
- [ ] 5. Update `.env.example`, `.env.local.example`,
      `.env.production.example`.
- [ ] 6. Update `docs/AUTH-IMPLEMENTATION.md` §7 + §9.
- [ ] 7. Write `docs/changes/2026-09-03-brevo-smtp-email-config.md`.
- [ ] 8. Validate: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
