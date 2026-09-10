# Two-business seed update for multi-tenant isolation verification

**Type:** schema
**Date:** 2026-09-10
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

The previous seed created a single business (`test-biz-001`) with 8 employees. This made it impossible to verify that the API's business-scoped filters actually prevent cross-business data access. By seeding two businesses with intentionally overlapping `employeeId`, `nationalId`, and bank account values, we can manually verify strict tenant isolation.

Additionally, the previous seed bypassed API handlers and called `prisma.employee.create()` directly, so `nationalIdHash` was never computed. The seeded employees had `nationalIdHash = null`, meaning dedup checks would not function during verification. The new seed computes `nationalIdHash` explicitly via `hashNationalId()`.

---

## 2. What changed

- `prisma/seed.ts` now creates two businesses (`test-biz-001` / Test Business and `test-biz-002` / Test Business B).
- Seeded users: `admin-a@testbiz.local`, `operator-a@testbiz.local` (Business A); `admin-b@testbiz.local`, `operator-b@testbiz.local` (Business B).
- Seeded employees: `EMP001` / Alice Banda and `EMP002` / Bob Phiri in **both** businesses, sharing the same `nationalId` and bank account values.
- `nationalIdHash` is computed explicitly in the seed using `sha256(trim().toLowerCase())` to match the API's `hashNationalId()` logic.
- Removed old single-business seed accounts (`admin@testbiz.local`, `operator@testbiz.local`, `viewer@testbiz.local`).
- Settings are now seeded for both businesses.
- `src/app/login/page.tsx` demo accounts updated to reflect the two new businesses.

---

## 3. How it works

### `prisma/seed.ts`

- Added `hashNationalId()` from `node:crypto` matching the API's implementation in `src/app/api/employees/route.ts:9-11`.
- Business creation uses `upsert` with fixed IDs (`test-biz-001`, `test-biz-002`) for idempotency.
- Employee creation passes `nationalIdHash` directly in the `create()` call.

### `src/app/login/page.tsx`

- `DEMO_ACCOUNTS` array replaced with four entries: Admin A, Operator A, Admin B, Operator B.

### `prisma/schema.prisma:151`

- Changed `@@index([nationalIdHash])` to `@@index([businessId, nationalIdHash])` so the index matches the query pattern.

### Migration `20260910230000_composite_national_id_hash_index`

- Drops old `employees_national_id_hash_idx`.
- Creates `employees_business_id_national_id_hash_idx` on `(business_id, national_id_hash)`.

### Migration `20260910240000_drop_legacy_employee_id_unique`

- Drops legacy global unique index `employees_employee_id_key` created in `20260901030658_init`.
- This index incorrectly prevented the same `employeeId` from being reused across businesses, contradicting the composite `@@unique([employeeId, businessId])`.

---

## 4. What got better

- **Isolation verifiable**: Logging in as `admin-a@testbiz.local` shows only Business A's 2 employees; `admin-b@testbiz.local` shows only Business B's 2 employees.
- **Dedup correctness**: `nationalIdHash` is now populated in the seed, so creating a duplicate `nationalId` within the same business returns 400 as expected.
- **Cross-business dedup allowed**: Creating an employee with the same `nationalId` as the other business returns 201, confirming that dedup is business-scoped.
- **Index alignment**: The `nationalIdHash` index now reflects the actual query pattern, preventing accidental global lookups.

---

## 5. Risks and trade-offs

- Old single-business seed data is removed. If any integration tests or demo environments depended on `admin@testbiz.local`, they need updating.
- The seed now creates 2 businesses × ~40 settings = 80 settings rows, slightly increasing seed time (negligible in practice).
- Bank account dedup remains unchecked (existing behavior — acceptable per plan).

---

## 6. Test plan

- Run `npm run prisma:seed` after `prisma migrate deploy`.
- Manual verification:
  - Login as `admin-a@testbiz.local` → employees list shows 2 employees.
  - Login as `admin-b@testbiz.local` → employees list shows 2 employees.
  - `POST /api/employees` with same `nationalId` within same business → 400.
  - `POST /api/employees` with same `nationalId` as other business → 201.
  - `POST /api/employees` with same `employeeId` within same business → 400.
  - `POST /api/employees` with same `employeeId` as other business → 201.

---

## 7. Follow-ups

- Consider adding a bank-account dedup check **within** a business (out of scope for this change).
- Evaluate whether `SUPER_ADMIN` should be able to list employees across all businesses (currently blocked — intentional per plan).
