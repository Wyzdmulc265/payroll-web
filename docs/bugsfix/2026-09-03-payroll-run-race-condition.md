# Fix payroll create race with P2002 handling

**Type:** bugfix
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#10`

## 1. Symptom

Two concurrent payroll runs for the same period could both pass the
`existingCount` check and proceed to create records. The second
request would crash with a Prisma `P2002` unique-constraint error
(`payroll_records.payrollPeriod_employeeId`).

## 2. Reproduction

1. Open two browser tabs.
2. In both tabs, run payroll for the same period.
3. Both tabs show success; one crashes server-side with `P2002`.

## 3. Impact

- **High** for a payroll system: duplicate or missing payslips.
- The second request returned `500` instead of a clean `400`.

## 4. Root cause

`src/app/api/payroll/route.ts:121` checked `existingCount` before the
transaction, but two requests could interleave between the check and
the `create`. The `Promise.all` inside `$transaction` meant the
second request's first `create` would hit the unique constraint.

## 5. Fix

Wrapped the `$transaction` in a try/catch that maps
`PrismaClientKnownRequestError` with code `P2002` to a `400` response:

```ts
try {
  createdRecords = await prisma.$transaction(async (tx) => { ... });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return NextResponse.json(
      { success: false, error: `Payroll already exists for period ${payrollPeriod}` },
      { status: 400 }
    );
  }
  throw error;
}
```

## 6. Verification

- Manual: two concurrent requests now return `400` for the loser
  instead of `500`.

## 7. Prevention

- Add an integration test that fires two parallel payroll runs and
  asserts one succeeds and the other returns `400`.
