# Rename duplicate migration `payroll_config_snapshot`

**Type:** schema
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#28`

## 1. Why

Two migrations shared the name `payroll_config_snapshot`:
`20260901054845` and `20260901055119`. Prisma tracks migrations by
filename, so duplicate names are confusing in `prisma migrate status`
and can cause conflicts when replaying on a fresh database.

## 2. What changed

- Renamed `prisma/migrations/20260901055119_payroll_config_snapshot`
  to `prisma/migrations/20260901055119_payroll_config_snapshot_extend`.
- No SQL changes; the migration body is identical.

## 3. How it works

The timestamp prefix (`20260901055119`) is unchanged, so the migration
order is preserved. Only the descriptive suffix was updated.

## 4. What got better

| Before | After |
|--------|-------|
| Two migrations named `payroll_config_snapshot`. | Unique, descriptive names. |

## 5. Risks and trade-offs

- None. This is a metadata-only change.

## 6. Test plan

- Run `npx prisma migrate status` → verify no duplicate names.
- Run `npx prisma migrate deploy` on a fresh DB → verify both
  migrations apply in order.

## 7. Follow-ups

- Audit other migration names for similar collisions.
