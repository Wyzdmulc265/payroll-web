# Bug: Build fails with TypeScript errors after Next.js 16 and Prisma 7 upgrade

**Severity:** critical
**Date discovered:** 2026-09-03
**Date fixed:** 2026-09-03
**Reporter:** internal
**Related issue/PR:** none

---

## 1. Symptom

`npm run build` fails with TypeScript errors:

- `cookies().get()` — Property 'get' does not exist on type `Promise<ReadonlyRequestCookies>`
- `RouteContext` type mismatch — `Promise<{ id: string }>` not assignable to `Promise<{ id: string; userId: string }>`
- `status: string` not assignable to `BusinessStatus | EnumBusinessStatusFilter<"Business"> | undefined`
- `updateData.status?: string` not assignable to Prisma `UserUpdateInput` status type
- Cannot find module `@/prisma/generated/client` in tests
- `Role` enum cannot be used to index `Record<Role, readonly Permission[]>`

## 2. Reproduction

Run `npm run build` on the project after dependencies were updated (Next.js 16.3.4, Prisma 7.10.0). The TypeScript type checker fails before the build can complete.

## 3. Impact

The production build is completely blocked. No deployment can proceed until these type errors are resolved.

## 4. Root cause

Five separate incompatibilities introduced by framework/library version changes:

1. **Next.js 16 `cookies()` API change**: `cookies()` now returns `Promise<ReadonlyRequestCookies>` instead of `ReadonlyRequestCookies` directly. `page.tsx` called `cookies().get()` without `await`.

2. **Test helper `routeContext` type mismatch**: The `routeContext` helper in `admins.test.ts` was typed to return `{ params: Promise<{ id: string }> }`, but `putAdmin` and `deleteAdmin` expect `{ params: Promise<{ id: string; userId: string }> }`. Calls passing `userId` to `routeContext` failed because the function only accepted `{ id: string }`.

3. **Prisma enum type strictness**: `businesses/route.ts` used `{ status: statusFilter }` where `statusFilter` is `string`, but Prisma expects `BusinessStatus`. Similarly, `[userId]/route.ts` had `updateData.status?: string` which doesn't match Prisma's `UserStatus` type.

4. **Wrong import path in test**: `permissions.test.ts` imported from `@/prisma/generated/client`, but the `@/*` alias maps to `./src/*`, so it resolved to `src/prisma/generated/client` which doesn't exist. The generated client is at `prisma/generated/client`.

5. **Enum indexing type issue**: `rolePermissions[role]` failed because TypeScript couldn't confirm `Role` (a string literal union from Prisma's generated client) is a valid index for `Record<Role, readonly Permission[]>`.

## 5. Fix

1. **`src/app/page.tsx`**: Changed `cookies().get(...)` to `(await cookies()).get(...)` to handle the Promise return type.

2. **`src/app/api/admin/__tests__/admins.test.ts`**: Changed `DELETE` test calls from `routeContext({ id, userId })` to `userContext({ id, userId })` which returns the correct type `{ params: Promise<{ id: string; userId: string }> }`.

3. **`src/app/api/admin/businesses/[id]/admins/[userId]/route.ts`**: Changed `updateData` type from `{ email?: string; passwordHash?: string; status?: string }` to `Record<string, unknown>` to satisfy Prisma's strict `UserUpdateInput` type constraints.

4. **`src/app/api/businesses/route.ts`**: Added `import type { BusinessStatus }` from the generated client and cast `statusFilter as BusinessStatus` when building the `where` clause. Changed empty object `{}` to `undefined` for the `where` filter.

5. **`src/lib/auth/__tests__/permissions.test.ts`**: Fixed import path from `@/prisma/generated/client` to `../../../../prisma/generated/client`. Added `as Role` cast on `rolePermissions[role]` to satisfy TypeScript's enum indexing check.

## 6. Verification

- `npx tsc --noEmit` passes with zero errors
- `npm run build` starts successfully (Next.js compilation begins without type-check failures)

## 7. Prevention

- When upgrading Next.js or Prisma, review the changelog for breaking API changes (especially around async APIs and stricter enum typing)
- Import paths for the generated Prisma client should use relative paths from `prisma/generated/client`, not the `@/*` alias which only maps to `src/`
- Test helpers that create route context objects should match the exact `RouteContext` type expected by the target route handler