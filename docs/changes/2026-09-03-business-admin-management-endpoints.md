# Business admin management endpoints

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

`SUPER_ADMIN` could create an *initial* admin when creating a business (via the optional `initialAdmin` body on `POST /api/businesses`), but had no in-app way to add a *second* admin, edit an existing one, or deactivate one. All of those required direct DB access. The locked decision for the SUPER_ADMIN-Only UI calls for inline admin management from the Businesses drawer.

## 2. What changed

- `src/app/api/admin/businesses/[id]/admins/route.ts` — new `GET` (list admins) and `POST` (create ADMIN) handlers.
- `src/app/api/admin/businesses/[id]/admins/[userId]/route.ts` — new `PUT` (edit email/password) and `DELETE` (soft-deactivate) handlers.
- `src/lib/auth/schemas.ts:73` — new `createBusinessAdminSchema` with role enum hard-locked to `['ADMIN']`. Defense in depth: the route handler re-checks the parsed role post-parse.
- `src/app/api/businesses/route.ts:33` — `GET` now accepts an optional `?status=ACTIVE|INACTIVE` filter (the page's status chips wire to it).
- `src/app/businesses/page.tsx:1` — drawer (add/edit/deactivate admin) + status chips + row-level Deactivate button + auto-open from `?drawer=<id>`.

## 3. How it works

### Schema defense (privilege escalation guard)

```ts
// createBusinessAdminSchema
export const createBusinessAdminSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: passwordSchema,
  role: z.enum(['ADMIN']).default('ADMIN'),
});
```

The `PUT` route uses a similar inline `updateAdminSchema` that allows `{ email?, password?, status? }` but does not accept a `role` field — the only role managed here is `ADMIN`.

### `businessId` is path-derived, never body-derived

Every admin endpoint queries the path `[id]` to find the business, and the `user.create` / `user.update` call sets `business: { connect: { id: business.id } }`. Any `businessId` in the request body is ignored.

### Self-deactivation is structurally impossible

SUPER_ADMIN's `session.user.businessId` is `null`. The `user-management.ts` self-mutation guard (`isSelfMutation`) is therefore never true: a SUPER_ADMIN's `session.user.id` is *not* in the path `[id]` of an admin endpoint (which always targets a tenant user). The audit-constants `AuditLogFilters` type and the route handler are written as if the guard were checked, but the structurally-null businessId is the primary safeguard.

### `DELETE` is a soft deactivation

`DELETE /api/admin/businesses/[id]/admins/[userId]` flips `User.status` from `ACTIVE` to `INACTIVE` and writes a `USER_DEACTIVATED` audit row. Already-`INACTIVE` admins are rejected (400) to keep the operation idempotent in the UI.

### `GET /api/businesses?status=…`

`status` is validated inline (`ACTIVE` or `INACTIVE` only); `ALL` is the client-side union of the two. The `where` clause is `{ status }` when set and `{}` otherwise.

## 4. Files

| File | Purpose |
| --- | --- |
| `src/app/api/admin/businesses/[id]/admins/route.ts` | List + create admin |
| `src/app/api/admin/businesses/[id]/admins/[userId]/route.ts` | Edit + soft-deactivate admin |
| `src/lib/auth/schemas.ts` | `createBusinessAdminSchema` (role locked to `ADMIN`) |
| `src/app/api/businesses/route.ts` | `?status=` filter |
| `src/app/businesses/page.tsx` | Status chips, drawer, deactivate button, auto-open |

## 5. What got better

- **Operational parity**: SUPER_ADMIN can fully manage a tenant's admin roster from the UI.
- **Privilege safety**: the role enum is hard-locked to `ADMIN` at the schema level; route handlers re-check the parsed role.
- **Auditability**: every mutation writes a `USER_CREATED` / `USER_UPDATED` / `USER_DEACTIVATED` row inside the same Prisma transaction as the user change. Old/new snapshots are the safe-user DTO (no password hash).
- **Tenant safety**: the `PUT` route validates `id + businessId` together — `PUT /api/admin/businesses/BizB/admins/userOfBizA` returns 404. Asserted by test.

## 6. Risks and trade-offs

- A deactivated admin cannot be reactivated from this surface. The edit modal is the reactivation path (it allows `status: ACTIVE`).
- The `PUT` route does not accept a `role` field. Changing an admin's role is intentionally not supported; the only managed role is `ADMIN`.

## 7. Test plan

- `src/app/api/admin/__tests__/admins.test.ts`:
  - ADMIN token → 403
  - GET lists admins (one seeded ADMIN)
  - POST creates an admin + writes `USER_CREATED` audit
  - POST duplicate email → 400
  - POST unknown business → 404
  - PUT updates an admin's email
  - DELETE soft-deactivates + writes `USER_DEACTIVATED` audit
  - DELETE on already-`INACTIVE` → 400
  - Cross-business allowed: SUPER_ADMIN can target `BizB` even though their own user is in `BizA`'s test data (or unowned)
  - PUT across businesses (admin belongs to A, path targets B) → 404
