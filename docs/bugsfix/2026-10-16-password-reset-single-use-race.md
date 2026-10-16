# Password Reset Token Race

**Severity:** high
**Date discovered:** 2026-10-16
**Date fixed:** 2026-10-16
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

Two concurrent submissions of the same pending password-reset token could both pass the pre-transaction check and attempt to change the password.

## 2. Reproduction

Submit two concurrent `POST /api/auth/reset-password` requests with the same valid token and different new passwords.

## 3. Impact

A one-time token did not have a strict single-redemption guarantee under concurrent requests; the final password could depend on transaction ordering.

## 4. Root cause

The route read token status before its transaction and unconditionally changed it to USED inside the transaction.

## 5. Fix

The transaction now conditionally updates the row only while it is PENDING and unexpired. It proceeds with the password change only when exactly one row was claimed; losing requests receive the invalid/expired response.

## 6. Verification

Added a concurrent-redemption regression test to `src/lib/auth/__tests__/auth-flows.test.ts`; it asserts exactly one success and one rejection. The DB-backed test still requires a reliable test database run.

## 7. Prevention

Use conditional database writes for one-time tokens and assert the affected-row count before applying associated state changes.
