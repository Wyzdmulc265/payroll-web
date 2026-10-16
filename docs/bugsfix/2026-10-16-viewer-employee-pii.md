# Viewer Employee PII Exposure

**Severity:** high
**Date discovered:** 2026-10-16
**Date fixed:** 2026-10-16
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

VIEWER employee reads returned decrypted national ID, bank details, tax number, and free-form notes. The bank payment report also used the broad READ_REPORTS permission.

## 2. Reproduction

Read `/api/employees` or `/api/employees/:id` as a VIEWER for an employee with PII populated, or request `/api/reports?type=Bank%20Payment%20Schedule&period=2026-08` as a VIEWER.

## 3. Impact

Read-only accounts received information unnecessary for their role, including payment credentials and government identifiers.

## 4. Root cause

The employee routes decrypted and serialized whole Prisma records, and the bank report had no dedicated permission.

## 5. Fix

Added `employeeDtoForRole` to redact national ID, bank details, tax number, and notes for VIEWER responses. Added `EXPORT_BANK_PAYMENTS`, granted only to ADMIN and PAYROLL_OPERATOR, and enforced it in the report API. The report selector hides the bank schedule for VIEWER as a usability measure; the API remains authoritative. See `docs/API.md`.

## 6. Verification

Added unit coverage for role-specific DTOs and permission mapping, plus route-level regression cases in `src/lib/auth/__tests__/tenant-isolation.test.ts`. The DB-independent unit tests passed; route-level assertions were not rerun after the remote database timed out.

## 7. Prevention

Keep response DTOs minimal and make sensitive export permissions explicit at the server boundary.
