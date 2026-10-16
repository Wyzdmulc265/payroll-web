# National ID Hash Hardening

**Severity:** medium
**Date discovered:** 2026-10-16
**Date fixed:** 2026-10-16
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

The employee duplicate-detection index stored plain SHA-256 hashes of normalized national IDs, which could be guessed offline after a database disclosure.

## 2. Reproduction

Inspect `employees.national_id_hash` and compare candidate identifiers by hashing their normalized values with SHA-256.

## 3. Impact

Low-entropy identifiers were susceptible to offline dictionary enumeration even though the original field was encrypted.

## 4. Root cause

Duplicate detection used an unkeyed digest so the hash could be recomputed without an application secret.

## 5. Fix

New hashes use HMAC-SHA-256 with domain separation and a key derived from `ENCRYPTION_KEY`. Duplicate checks accept both HMAC and legacy SHA-256 during gradual rehash-on-update. Seed code uses the same helper. See `docs/DATABASE.md`.

## 6. Verification

Added tests for normalized HMAC values and legacy lookup compatibility in `src/lib/__tests__/national-id.test.ts`; the focused unit suite passes.

## 7. Prevention

Keep the HMAC key stable and secret. Rotating `ENCRYPTION_KEY` also changes future national-ID hashes; existing records should be backfilled while both old/new lookup values are available.
