# Rate-limit `/api/payroll/calculate`

**Type:** security
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#30`

## 1. Why

`/api/payroll/calculate` was unguarded. A malicious or buggy client
could hammer the engine with hundreds of preview requests per minute,
wasting CPU and DB connections.

## 2. What changed

- Refactored `src/lib/auth/rate-limit.ts` to expose a generic
  `checkRateLimit(key, maxAttempts, windowMs)` function.
- `POST /api/payroll/calculate` now checks
  `checkRateLimit(\`payroll_calculate:${businessId}:${userId}\`, 10,
  60000)` and returns `429` when exceeded.
- Login rate limiting (`checkLoginRateLimit`) now delegates to the
  generic function.

## 3. How it works

The same `RateLimit` table used by login is reused. Each business+user
pair gets 10 requests per minute. The `retryAfterSeconds` value is
returned so the client can back off.

## 4. What got better

| Before | After |
|--------|-------|
| Unlimited calculate requests. | 10 req/min per user per business. |

## 5. Risks and trade-offs

- Power users doing batch previews may hit the limit. The limit can
  be raised via env vars if needed.

## 6. Test plan

- Manual: fire 11 rapid requests → verify `429` on the 11th.
- Run `npm test` (skipping DB-dependent suites).

## 7. Follow-ups

- Apply the same rate limiter to `/api/payroll` (run) once the
  per-run cost is understood.
