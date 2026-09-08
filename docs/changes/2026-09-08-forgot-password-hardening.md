# Forgot-Password Process Hardening — 2026-09-08

## Summary

A security review of the forgot-password process identified several gaps. This change closes them:

1. **Transactional session invalidation (P0).** After a successful password reset, all of the user's sessions are now invalidated *inside* the same Prisma transaction as the password rotation and token marking. Previously `invalidateAllSessionsForUser` ran after the transaction committed — if it failed, old sessions would have remained valid against a new password.
   - `src/lib/auth/session.ts` — `invalidateAllSessionsForUser` (and `invalidateSession`) now accept an optional `Prisma.TransactionClient`.
   - `src/app/api/auth/reset-password/route.ts` — invalidation moved into the `$transaction` block.

2. **Password-changed notification email (P1).** A new `sendPasswordChangedNotification()` in `src/lib/mail.ts` emails the user after a successful reset, including the requesting IP and device (both HTML-escaped), plus a "reset immediately" link if the change wasn't theirs. The call is fire-and-forget outside the transaction with redacted error logging; failures never block the response.

3. **Background cleanup of expired reset tokens (P1).** New `pruneExpiredPasswordResets()` in `src/lib/auth/rate-limit.ts` deletes expired `PasswordReset` rows; it is invoked probabilistically (~5%) by the forgot-password route, bounding `password_resets` table growth for users who never request another reset.

4. **Token pre-validation on the reset page (P2).** The reset-password API route now exposes a `GET /api/auth/reset-password?token=...` handler (separate `reset-validate:{ip}` rate-limit bucket, 30/15-min) that reports whether the token is PENDING and unexpired. The reset page (`src/app/reset-password/[token]/page.tsx`) validates the token on mount and shows an inline "link invalid or expired" state — with a re-request link — instead of a doomed password form. The authoritative check remains in POST; network errors during pre-validation do not block the form.

## Security considerations

- The GET handler reveals only "valid token or not" to whoever holds the token; it leaks nothing about accounts and is itself rate-limited.
- The notification email escapes client-supplied IP/user-agent values to prevent HTML injection.
- Session invalidation is now atomic with the password change; no window exists where an old session survives a committed rotation.
- No-enumeration guarantee on forgot-password is unchanged (generic 200 + generic message).

## Testing

- `npm test` (vitest) run; existing auth-flow and mail tests pass. New tests were not added for the pre-validation endpoint in this change (recommended follow-up).

## Files touched

- `src/lib/auth/session.ts`
- `src/app/api/auth/reset-password/route.ts` (GET handler + transactional invalidation + notification)
- `src/lib/mail.ts` (`sendPasswordChangedNotification`)
- `src/lib/auth/rate-limit.ts` (`pruneExpiredPasswordResets`)
- `src/app/api/auth/forgot-password/route.ts` (probabilistic pruning call)
- `src/app/reset-password/[token]/page.tsx` (token pre-validation UI)
- `docs/AUTH-IMPLEMENTATION.md` (token encoding corrected to hex)
