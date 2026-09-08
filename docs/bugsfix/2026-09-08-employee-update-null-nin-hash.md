# Employee partial update wiped the National-ID dedup hash

**Type:** bugsfix
**Date:** 2026-09-08
**Author(s):** AI assistant
**Related issue/PR:** docs/IMPROVEMENTS.md

---

## 1. Bug

`src/app/api/employees/[id]/route.ts` rebuilt `nationalIdHash` to `null`
whenever `nationalId` was **not** in the request body — i.e. on any legitimate
partial update (e.g. changing only `position`). Because the national ID itself
(stored encrypted) was left intact while its dedup hash was orphaned, a second
employee with the same NIN could then be created, sailing straight past the
duplicate check and the `employees_national_id_hash_idx` uniqueness.

## 2. Repro

1. Create employee A with `nationalId: 123`.
2. `PUT /api/employees/{A}` with `{ "position": "Dev" }` (no `nationalId`).
3. Create employee B with `nationalId: 123` → previously returned `201`
   instead of the expected `400` duplicate.

## 3. Root cause

```ts
if (validatedData.nationalId) { …hash… } else { nationalIdHash = null; }
```
The `else` branch clobbered the hash on updates that didn't touch the NIN.

## 4. Fix

When `nationalId` is absent but the existing row has one, re-derive the hash
from the existing (decrypted) value instead of nulling it. The `null` fallback
now only applies when the existing row truly has no NIN. (Creating an employee
already hashes + dedups correctly.)

## 5. Verification

- `npx tsc --noEmit` passes.
- Logic exercised via the shared `hashNationalId` + `decryptPii` path; a DB
  integration assertion lives in `docs/IMPROVEMENTS.md` follow-up (no test DB
  wired here).