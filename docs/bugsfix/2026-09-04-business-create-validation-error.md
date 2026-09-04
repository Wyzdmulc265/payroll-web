# Bug: SUPER_ADMIN business creation fails with bare "Validation error"

**Severity:** medium
**Date discovered:** 2026-09-04
**Date fixed:** 2026-09-04
**Reporter:** user
**Related issue/PR:** none

---

## 1. Symptom

As SUPER_ADMIN, openingPlug "New Business", entering a business name plus an
initial admin email/password, and submitting showed a red
`Validation error` with no further explanation. Retrying changed nothing, so
from the user's perspective business creation was broken. Name-only creation
was unaffected.

## 2. Reproduction

1. Log in as SUPER_ADMIN → `/businesses` → "New Business".
2. Enter any name, an admin email, and a password that violates the shared
   policy (e.g. `weakpass1` — no uppercase letter, or fewer than 8 chars).
3. Submit → `400 { success: false, error: "Validation error", details: [...] }`,
   dialog renders only `"Validation error"`.

## 3. Impact

- **Medium:** SUPER_ADMIN could not provision a business with its initial
  admin unless they happened to guess the undisclosed password rules. No data
  corruption — the server correctly rejected a weak password; only the
  messaging and the missing client-side check were at fault.

## 4. Root cause

Two compounding issues, both client-side (`src/app/businesses/page.tsx`):

1. `handleCreate` validated only presence and confirm-match, never strength —
   while the server enforces `passwordSchema` (min 8 chars, one uppercase,
   one number; `src/lib/auth/schemas.ts:3`) on
   `createBusinessSchema.initialAdmin.password`. Any non-conforming password
   round-tripped to a `400`.
2. The failure branch rendered only `json.error` (`"Validation error"`) and
   discarded `json.details`, which carried the actionable Zod messages —
   verified: `weakpass1` yields
   `"Password must contain at least one uppercase letter"`.

## 5. Fix

- `handleCreate` now mirrors the server policy before sending (length,
  uppercase, digit), each with a specific message.
- The `!res.ok` branch now appends `details[].message` to the dialog error,
  so any future 400 is actionable.
- Added a hint under the password field:
  "Min 8 characters, one uppercase letter, one number."

## 6. Verification

- `npx tsx` parse check against `createBusinessSchema`: weak password → Zod
  failure with the uppercase message; strong password → pass (mechanism
  confirmed before the fix).
- `npx tsc --noEmit` — clean; `npx eslint` on the page — 0 errors
  (1 pre-existing unrelated `exhaustive-deps` warning at line 112).
- Manual retest path: same repro steps with `weakpass1` now show
  "Initial admin password must contain at least one uppercase letter"
  before any request; a conforming password submits normally.

## 7. Prevention

- Client forms that POST passwords must validate against the shared policy
  up front; consider exporting a single `isPasswordStrong` helper from
  `src/lib/auth` and reusing it in every admin-creation form (business
  create, business-admin drawer, users page) so the rule cannot drift again.
- API error branches should render `details` wherever the envelope provides
  them — bare `json.error` hides exactly the information needed to recover.
