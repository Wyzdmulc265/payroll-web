# Fix employee duplicate-check runtime type error

**Severity:** high
**Date discovered:** 2026-09-02
**Date fixed:** 2026-09-02
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

`POST /api/employees` would throw a Prisma runtime error when checking
for duplicate `employeeId` values, because the query used `findUnique`
on a field that has no `@unique` constraint in the schema.

## 2. Reproduction

1. Send `POST /api/employees` with `employeeId: "EMP001"`.
2. The route executes `prisma.employee.findUnique({ where: { employeeId: "EMP001" } })`.
3. Prisma throws: `Invalid `prisma.employee.findUnique()` invocation ...`

## 3. Impact

Any attempt to create an employee failed with a 500 error. The duplicate-
check guard was completely broken.

## 4. Root cause

`src/app/api/employees/route.ts:112` used `findUnique` scoped only to
`employeeId`, but the schema enforces uniqueness via the composite
`@@unique([employeeId, businessId])`. There is no `@unique` on
`employeeId` alone. The query also did not scope by `businessId`, so a
different business could not reuse `EMP001`.

## 5. Fix

Replaced `findUnique` with `findFirst` scoped to both `employeeId` and
`businessId`:

```ts
const existing = await prisma.employee.findFirst({
  where: {
    employeeId: validatedData.employeeId,
    businessId: session.user.businessId,
  },
});
```

## 6. Verification

- `npx vitest run` passes (existing engine tests unaffected).
- Manual: `POST /api/employees` with a new `employeeId` returns 201.
- Manual: `POST /api/employees` with a duplicate `employeeId` within the
  same business returns 400.

## 7. Prevention

- The Prisma schema's `@@unique([employeeId, businessId])` is the source
  of truth; queries should use `findFirst` with both fields.
- Add a test that exercises the duplicate-check path.
