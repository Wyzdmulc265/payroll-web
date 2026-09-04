# Security hardening: CSRF fallback, headers, PII encryption, rate limiting

**Type:** security
**Date:** 2026-09-04
**Author(s):** AI assistant
**Related issue/PR:** none

## 1. Why

A comprehensive security review identified 4 critical and 3 high-severity issues in the application's security posture. The most impactful were:

- CSRF protection bypassed when no Origin/Referer headers present (`src/proxy.ts:59` returned `true`)
- No security headers (CSP, X-Frame-Options, HSTS, etc.) configured in `next.config.ts`
- Employee PII (national ID, bank account, tax number) stored unencrypted in PostgreSQL
- Rate limiting keyed on `IP:User-Agent` trivially bypassable by rotating UA strings
- Password reset tokens logged to console in development mode
- Cookie-clearing in proxy missing `secure` flag

## 2. What changed

- `isSameOrigin()` fallback changed from `return true` to `return false` when neither Origin nor Referer headers are present
- Security headers added to `next.config.ts`: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, HSTS, Permissions-Policy
- New `src/lib/encryption.ts` module provides AES-256-GCM field-level encryption for employee PII fields (`nationalId`, `accountNumber`, `taxNumber`)
- Employee API routes (`/api/employees`, `/api/employees/[id]`) now encrypt PII on write and decrypt on read
- Payslip and Bank Payment Schedule report routes decrypt employee PII for display
- Rate limit key changed from `IP:User-Agent` to IP-only in login route
- Password reset token no longer logged to console in development
- Proxy cookie-clearing now includes `secure` flag matching `clearSessionCookie` behavior
- `ENCRYPTION_KEY` env var added to `.env.example` and `.env.production.example`
- New test suite: `src/lib/__tests__/encryption.test.ts` (10 tests)
- Mail test updated to verify token is NOT logged

## 3. How it works

### CSRF fallback (`src/proxy.ts:59`)
The `isSameOrigin()` function checks Origin and Referer headers against the request host. When neither header is present (e.g. curl, Postman, server-to-server), the function now returns `false`, blocking the request. This only affects mutating methods (POST/PUT/PATCH/DELETE) due to the guard at line 72.

### Security headers (`next.config.ts`)
Added via Next.js `headers()` config:
```ts
async headers() {
  return [{ source: '/(.*)', headers: securityHeaders }];
}
```

### PII encryption (`src/lib/encryption.ts`)
- Uses AES-256-GCM with random 96-bit IV per encryption call
- Ciphertext stored as `base64(iv + authTag + ciphertext)`
- Key read from `ENCRYPTION_KEY` env var (64-char hex = 32 bytes)
- When key is not set (local dev), encrypt/decrypt are transparent pass-throughs
- `encryptPii()` / `decryptPii()` operate on any record, only touching fields present in the `PII_FIELDS` array

### Rate limiting (`src/app/api/auth/login/route.ts:18`)
Changed from `IP:User-Agent` to IP-only. Prevents bypass via UA string rotation.

## 4. What got better

| Area | Before | After |
|---|---|---|
| CSRF bypass | `isSameOrigin` returned `true` with no headers | Returns `false` (blocked) |
| Security headers | None configured | 6 headers (X-Frame-Options, HSTS, etc.) |
| Employee PII | Stored as plaintext in DB | AES-256-GCM encrypted at rest |
| Rate limit bypass | Rotating UA strings bypasses limit | IP-only key, rotation ineffective |
| Token leakage | Full reset URL logged in dev | Token omitted from logs |
| Cookie security | Clear-cookie missing `secure` flag | `secure` flag set in production |

## 5. Risks and trade-offs

- **CSRF change**: API testing tools (curl, Postman) making POST requests without an Origin header will now be blocked by the proxy. Developers must add `Origin: http://localhost:3000` header to test mutating endpoints.
- **Encryption key**: Production must set `ENCRYPTION_KEY`. Existing plaintext PII must be re-encrypted after enabling. The pass-through behavior means dev environments work without the key.
- **No DB migration needed**: Encryption is applied at the application layer. Existing plaintext values will be encrypted on next write (employee update). A backfill script should be run to encrypt all existing records.

## 6. Test plan

- TypeScript: `npx tsc --noEmit` passes cleanly
- Unit tests: `npm run test` — all tests pass (10 new encryption tests, 1 updated mail test)
- Manual: verified CSRF blocks POST without Origin header; verified security headers appear in response

## 7. Follow-ups

- Run a backfill script to encrypt all existing employee PII records in the database
- Consider adding CSP headers (requires auditing inline styles/scripts from Recharts)
- Add a migration guide in `docs/` for the `ENCRYPTION_KEY` setup
- Consider rate limiting on additional endpoints (password reset, account changes)
