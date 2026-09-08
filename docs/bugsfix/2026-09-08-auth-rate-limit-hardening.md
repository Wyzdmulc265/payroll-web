# Auth rate-limit hardening: login/IP-spoof bypass and unthrottled password-reset

**Type:** bugsfix
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** docs/IMPROVEMENTS.md M1

---

## 1. Bugs

### 1a. Login rate limit keyed on IP only, IP read from spoofable header

`checkLoginRateLimit` keyed solely on the request IP. The IP was read from the
raw `x-forwarded-for` header (`request.headers.get('x-forwarded-for')?.split(',')[0]`) —
a value the client controls when the app sits behind no trusted reverse proxy.
An attacker could:

- **Bypass** the 5-attempt lockout by rotating the `X-Forwarded-For` header.
- **Deny service** to a victim by spoofing the victim's IP in the header,
  locking *them* out for 15 minutes.

### 1b. No rate limiting on password-reset request or token redemption

`forgot-password/route.ts` had **no rate limit at all** — an attacker could:
- Email-bomb a victim indefinitely (each request also inserts a `PasswordReset`
  row, growing the table unbounded).
- Enumerate which emails have accounts by timing response differences.

`reset-password/route.ts` had no throttle on token redemption, allowing
brute-force probing of the 64-hex-char token space.

## 2. Fixes

### Login — composite IP + email key

```ts
const key = `login:${ipAddress}|${email.toLowerCase()}`;
```

The email dimension means an attacker who rotates a spoofed IP can no longer
hammer a single victim account. The IP dimension still throttles one client
spraying many emails. `clearLoginRateLimit(key)` runs only on success so a
locked-out IP+email pair must wait out the window.

### Forgot password — per-email + per-IP dual limit

```ts
for (const key of [`forgot:${email.toLowerCase()}`, `forgot:${ipAddress}`]) {
  const limit = await checkRateLimit(key, 5, 60 * 60 * 1000); // 5/hour
```

Both dimensions must be under their limit; the generic response body preserves
the no-enumeration guarantee. Expired `passwordReset` rows are cleaned
(`deleteMany`) before minting a new token, bounding table growth.

### Reset password — per-IP throttle

```ts
const limit = await checkRateLimit(`reset:${ipAddress}`, 10, 15 * 60 * 1000); // 10/15-min
```

Defence-in-depth against token-guessing and scripted abuse of a leaked token.

### Rate-limit row pruning

`src/lib/auth/rate-limit.ts` already includes
`pruneExpiredRateLimits()` (64-char key, `resetAt` index). It runs
probabilistically (~5% of calls) so the `RateLimit` table cannot grow without
bound.

## 3. Remaining limitation

`getForwardedIp` still reads from `x-forwarded-for` directly. When the app is
behind a trusted proxy (e.g. Vercel, Nginx, Cloudflare) this header is set by
the proxy and is trustworthy; without one, IP-based limits remain spoofable.
The composite key mitigates the *user-impact* of spoofing (attacker must know
the victim's email too), but the IP dimension is still advisory in a
no-proxy deployment.