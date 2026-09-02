# Bug: Employee form rejects flat salary figures and sends numeric fields as strings

**Severity:** medium
**Date discovered:** 2026-09-02
**Date fixed:** 2026-09-02
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

When adding a new employee on the **Add Employee** form (`Employees` page), two
problems occur:

1. Entering a round salary figure such as `350000` in the **Basic Salary**
   field triggers a browser validation error. The browser effectively
   forces the user to enter `350001` instead.
2. Even when a value is accepted by the browser, clicking **Create** sends
   `basicSalary` (and `allowances`) to the API as a **JSON string** rather
   than a number. The API's Zod schema rejects it with
   `Expected number, received string`, blocking employee creation entirely.

## 2. Reproduction

1. Navigate to `/employees` and click **Add Employee**.
2. Fill in all required fields.
3. Enter `350000` in the **Basic Salary (MWK)** field.
4. Click **Create**.
   - **Before fix**: The browser's native number-input validation
     rejects `350000` because of `min="1"` + `step="1000"`. The only
     accepted values are `1, 1001, 2001, …, 350001`.
   - Enter `350001` instead and submit. The fetch payload contains
     `"basicSalary": "350001"` (string). The API's Zod schema
     (`z.number().positive()`) returns a 400 validation error:
     `Expected number, received string`.

## 3. Impact

- **User-facing**: Any payroll administrator trying to create an employee
  with a round-number salary (the common case for MWK salaries) is blocked.
- **Workaround** (use odd values like `350001`) is non-obvious and
  produces confusing validation errors.
- Affects both **create** (`POST /api/employees`) and **edit**
  (`PUT /api/employees/:id`) paths, since both share the same form and
  Zod schema (`basicSalary: z.number().positive()`).

## 4. Root cause

Both bugs live in **`src/app/employees/page.tsx`**:

### 4.1. `step="1000"` paired with `min="1"` (lines 537–554)

The basic salary `<input>` was:

```tsx
<input
  type="number"
  value={formData.basicSalary}
  onChange={(e) => setFormData({ ...formData, basicSalary: e.target.value })}
  className="input"
  min="1"
  step="1000"   /* ← BUG: valid values are min + n*step = 1, 1001, 2001, … */
  required
/>
```

HTML number-input `step` validation computes valid values as
`min + n × step`. With `min="1"` and `step="1000"`:

| Input | Browser check | Result |
|-------|--------------|--------|
| `350000` | `(350000 - 1) % 1000 = 999 ≠ 0` | **Rejected** |
| `350001` | `(350001 - 1) % 1000 = 0` | Accepted |

The allowances input had the same `step="1000"` issue (though `min="0"`
spared it from the odd-number problem, round values like `5000` were still
the only accepted ones).

### 4.2. String values not coerced before `JSON.stringify` (lines 125–147)

`formData` is typed with `basicSalary: ''` and `allowances: ''` (empty
strings). The `onChange` handler assigns `e.target.value`, which is
**always a string** for text/number inputs. `handleSubmit` then did:

```tsx
body: JSON.stringify(formData),  /* ← basicSalary is "350000" (string) */
```

The API routes in `src/app/api/employees/route.ts` (line 14) and
`src/app/api/employees/[id]/route.ts` (line 13) both validate with
`z.number()`, which does **not** coerce strings. The request therefore
fails with a 400 ZodError regardless of the numeric value entered.

## 5. Fix

Two targeted changes in **`src/app/employees/page.tsx`**:

### 5.1. Remove the `step` constraint on numeric inputs

Changed `step="1000"` → `step="any"` on both **Basic Salary** and
**Allowances** inputs. This lets the user enter any positive number
(e.g. `350000`, `5000`, `1650000`) without browser-level step rejection.
The Zod schema on the API side remains the source of truth for numeric
validation.

```tsx
<input
  type="number"
  value={formData.basicSalary}
  onChange={(e) => setFormData({ ...formData, basicSalary: e.target.value })}
  className="input"
  min="1"
  step="any"   /* was step="1000" */
  required
/>
```

### 5.2. Coerce form strings to numbers before sending

`handleSubmit` now builds a `payload` object that converts
`basicSalary` and `allowances` to JavaScript `Number` values before
`JSON.stringify`:

```tsx
const payload: Record<string, unknown> = {
  ...formData,
  basicSalary: formData.basicSalary === '' ? undefined : Number(formData.basicSalary),
  allowances: formData.allowances === '' ? 0 : Number(formData.allowances),
};

const res = await fetch(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

- An empty `basicSalary` yields `undefined` so the API's required-field
  Zod error fires (clear message) rather than a type-mismatch error.
- An empty `allowances` defaults to `0`, matching the Prisma
  `@default(0)` and the Zod `.default(0)` on the schema.

## 6. Verification

- **Manual repro**: Enter `350000` in Basic Salary → browser accepts it.
  Click **Create** → employee is created successfully. Inspect Network
  tab: request body shows `"basicSalary": 350000` (number, not string).
- **Manual repro (edit)**: Edit an existing employee, change salary to
  `500000`, click **Update** → succeeds; PUT body shows
  `"basicSalary": 500000` (number).
- **Edge case**: Leave Basic Salary blank → Zod returns
  `Required` error (clear message) instead of `Expected number, received string`.
- **Type check**: `npx tsc --noEmit` passes (payload is typed as
  `Record<string, unknown>`; the API Zod schemas are unchanged).
- **All other fields** (strings, booleans, dates) are unaffected — they
  were already correctly typed.

## 7. Prevention

- **Schema-level defense**: Consider switching the API Zod schemas to
  `z.coerce.number()` for monetary fields. This would make the API
  tolerant of string inputs regardless of client bugs. Current stance is
  to keep `z.number()` and fix the client, but this can be revisited if
  other clients are added.
- **Component-level**: A reusable `<MoneyInput />` component that
  manages its own string→number conversion would eliminate this
  class of bug for all monetary fields across the app. The Add Employee
  and Edit Employee forms are the first consumers, but the payroll
  run form (`src/app/payroll/page.tsx`) has similar `<input type="number">`
  patterns that could benefit.
- **IMPROVEMENTS.md**: See entry on "type-safe form payloads" for a
  broader plan to centralize coercion.
