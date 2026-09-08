# Encryption fail-fast in production when ENCRYPTION_KEY is missing

**Type:** bugsfix
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** docs/IMPROVEMENTS.md H3

---

## 1. Bug

`src/lib/encryption.ts` (introduced by `docs/changes/2026-09-04-security-hardening.md`)
read `ENCRYPTION_KEY` from the environment and, when unset, silently fell back
to **transparent pass-through** — storing `nationalId`, `accountNumber`, and
`taxNumber` as plaintext in PostgreSQL. The `.env.example` even recommended
leaving the key empty in development, so the default state of the system was
"no encryption."

In production this is a silent regulatory breach: a misconfigured deployment
(omitted, mistyped, or 31-byte key) would write PII in cleartext with **zero
warning** at startup — only failing later (and inconsistently) at encrypt time.

## 2. Fix

`getKey()` now **throws at application start** when:

- `ENCRYPTION_KEY` is unset **and** `NODE_ENV === 'production'`, or
- `ENCRYPTION_KEY` is set but decodes to anything other than 32 bytes.

Development (`NODE_ENV !== 'production'`) keeps the frictionless pass-through so
a fresh local DB is easy to spin up.

## 3. Tests added

`src/lib/__tests__/encryption.test.ts` → new `production fail-fast` describe block:

- `encrypt()` and `decrypt()` throw when the key is missing in production.
- Pass-through still works when the key is missing in development.
- A 62-character (31-byte) key throws a length error.

## 4. Risks / follow-ups

- Any existing production DB with plaintext PII rows (deployed before this fix)
  should be backfilled using a one-off script that re-encrypts the three PII
  columns. The docs mention a backfill script "should be run" but none exists
  in the repo yet — tracked as a follow-up.
- The malformed-key check (`buf.length !== 32`) fires at encrypt/decrypt call
  time, not at boot. A boot-time validation helper could be added for
  faster feedback.