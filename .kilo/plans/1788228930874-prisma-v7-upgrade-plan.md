# Plan: Smooth in-place upgrade — Prisma 7 + Next.js 16.3.4 (payroll-web)

## Goal
Bring the existing Next.js 16 payroll app to **Prisma 7 idioms** and bump Next.js to the latest patch (`16.3.4`), while keeping the stack, the API surface, and the payroll logic unchanged. Remove the v5/v6-era `@auth/prisma-adapter` blocker, introduce a real migrations folder, and verify the build, tests, and `db:setup` workflow.

Out of scope: adopting Prisma Composer (the new "Prisma App" framework), introducing `rawPostgres()` / RPC contracts, or changing the deployment target.

## Decisions (locked)
- **Auth:** remove `@auth/prisma-adapter` from `package.json`. It is declared but no source file imports it. `next-auth` stays.
- **DB driver:** Prisma 7's built-in PostgreSQL driver. No `@prisma/adapter-pg`, no `driverAdapter` field in the schema.
- **Generator:** switch to v7's required `output` field, with `provider = "prisma-client"` (the v7 default) and `output = "./generated"` (sibling of `schema.prisma`). Generated client lives at `prisma/generated/client`.
- **Migrations:** switch from `prisma db push` to `prisma migrate`. Author a baseline `init` migration. Update `db:setup` to use `migrate deploy` + seed.
- **Dev DB state:** none exists yet, so `prisma migrate dev --name init` produces the baseline from empty.
- **Next.js:** bump from `16.3.3` to `16.3.4` (current latest, published 31 Aug 2026). Patch-level, no breaking changes. Bump `eslint-config-next` to the matching `16.3.4` line. No `next` v17+ exists; do not invent one.
- **Note on the v22+ claim:** the original request asked to bring Next.js "above v22 at least." As of the planning date, no such release exists — Next.js's Active LTS is the 16.3 line. The 16.3.4 bump is the actual current version.

## Context gathered
- `prisma/schema.prisma`: generator `client` with `provider = "prisma-client-js"` (the v6 spelling), datasource `postgresql` on `env("DATABASE_URL")`. Four models: `Employee`, `PayrollRecord`, `AuditLog`, `Settings`, all table-mapped via `@@map`. No enums, no composite types, no multi-schema.
- `src/lib/prisma.ts`: hand-rolled `PrismaClient` singleton with `globalThis` cache and a `log` array. Will be re-pointed at the v7 generated path.
- `prisma/seed.ts`: uses `new PrismaClient()` directly; deletes-then-creates. Will be re-pointed at the v7 generated path.
- 8 API routes under `src/app/api/**/route.ts` all import `prisma from '@/lib/prisma'`. Single import surface — updating `src/lib/prisma.ts` propagates.
- `package.json` already pins `prisma ^7.10.0` and `@prisma/client ^7.10.0`. The current code was written against v5/v6 idioms, so the versions are ahead of the code.
- `AGENTS.md` requires reading `node_modules/next/dist/docs/` for any Next-touching change. Prisma changes alone shouldn't need it, but the v7 docs recommend the same hot-reload-safe singleton pattern, so the diff is small.
- `node_modules/` was not present in the planning view; the implementer must run `npm install` (which already triggers `prisma generate` via `postinstall`) before validating.

## Key facts from Prisma 7 docs (verified)
- The generator's `output` field is **required**. The v6 default ("use `node_modules/@prisma/client`") is gone. The official v7 example uses `output = "./generated"` and imports from `./generated/client`.
- The new default provider name is `prisma-client` (not `prisma-client-js`). The v6 name may still work for back-compat but is not the v7 happy path.
- The hot-reload-safe singleton pattern from the v7 docs is identical to the one already in `src/lib/prisma.ts` — only the import path changes.
- The v7 docs no longer recommend `$disconnect()` in long-running apps. The current seed's `.finally(() => prisma.$disconnect())` is benign but can stay or be removed; leaving it is the lower-risk edit.

## Affected boundaries
- `package.json` — drop `@auth/prisma-adapter`; bump `next` to `16.3.4` and `eslint-config-next` to `16.3.4`; update scripts.
- `prisma/schema.prisma` — rewrite the `generator client` block; remove the v6 comment.
- `prisma/generated/` — new directory, gitignored, populated by `prisma generate`.
- `prisma/migrations/<timestamp>_init/migration.sql` — new committed baseline.
- `src/lib/prisma.ts` — change the import path to the v7 generated client.
- `prisma/seed.ts` — change the import path to the v7 generated client.
- `.gitignore` — add `prisma/generated` so generated files don't get committed.
- `package.json` scripts — replace `prisma:push` with `prisma:migrate` + `prisma:deploy`; update `db:setup`.

No source-code logic in API routes, the payroll engine, or components changes. Only the import surface, the migration workflow, and the two version lines in `package.json` do.

## Ordered task list

1. **Inventory & confirm scope.** Run `rg "@auth/prisma-adapter"` (expect zero matches), `rg "PrismaClient"` (expect hits in `src/lib/prisma.ts`, `prisma/seed.ts` only). Record resolved versions from `node_modules/prisma/package.json` and `node_modules/@prisma/client/package.json` after `npm install`.
2. **Add `prisma/generated` to `.gitignore`** so generated client files don't get committed.
3. **Update `prisma/schema.prisma` generator block.** Change to:
   ```prisma
   generator client {
     provider = "prisma-client"
     output   = "./generated"
   }
   ```
   Keep the datasource and all models unchanged. Remove the v6-era header comment.
4. **Update `src/lib/prisma.ts` import** to `import { PrismaClient } from "../prisma/generated/client";` (path is relative to `src/lib/`). Keep the `globalThis` cache and `log` array exactly as they are.
5. **Update `prisma/seed.ts` import** to `import { PrismaClient } from "./generated/client";`. Keep the seed body unchanged.
6. **Update `package.json` dependencies.**
   - Remove `@auth/prisma-adapter`.
   - Bump `"next": "16.3.3"` → `"next": "16.3.4"`.
   - Bump `"eslint-config-next": "16.3.3"` → `"eslint-config-next": "16.3.4"`.
   - Keep `prisma` and `@prisma/client` at their currently-resolved exact versions (no `^`) for reproducibility.
7. **Update `package.json` scripts.**
   - Replace `"prisma:push": "prisma db push"` with `"prisma:migrate": "prisma migrate dev"` and add `"prisma:deploy": "prisma migrate deploy"`.
   - Update `"db:setup"` to: `"npm run prisma:generate && npm run prisma:deploy && npm run prisma:seed"`.
   - Keep `"postinstall": "prisma generate"` so a fresh `npm install` always produces a client.
8. **Install and generate.** `npm install` (this also runs `prisma generate` via `postinstall`). Confirm `prisma/generated/client/` is created and `.gitignore` is excluding it. Confirm `next` resolves to `16.3.4`.
9. **Author the baseline migration.** `npx prisma migrate dev --name init`. Because no dev DB exists, this creates `prisma/migrations/<timestamp>_init/migration.sql` with the full DDL for the four models. Commit the `prisma/migrations/` directory tree.
10. **Validate against a fresh dev DB.**
    - `npm run db:setup` end-to-end (generate → migrate deploy → seed).
    - `npm run dev` boots; `POST /api/payroll/calculate` returns 200 with a calculation.
    - Exercise `/api/employees` and `/api/payroll` to confirm client queries work.
    - Confirm `next build` succeeds on the new patch version (the only Next.js change is a patch bump, so this is a smoke test, not a full migration exercise).
11. **Static checks.** `npm run lint`, `npx tsc --noEmit`, `npm run test`. Expect all to pass; the only code-shaped changes are the two import paths.
12. **Final hygiene check.** `rg "@auth/prisma-adapter"` returns zero matches. `rg "prisma-client-js"` returns zero matches. `prisma/generated/` is not tracked by git. The `prisma/migrations/` directory is committed.
13. **Commit decision is the user's** (per repo's "only commit when asked" rule).

## Risks & mitigations
- **`prisma-client` provider vs `prisma-client-js`.** The v7 happy path is the new provider name; the old one may still work but is undocumented in v7. Mitigation: use `prisma-client` and verify the generated `client.ts` exports the same `PrismaClient` class the rest of the app expects.
- **Import path typo** in `src/lib/prisma.ts` (off by one segment) breaks every API route at runtime. Mitigation: validate via the `npm run dev` + `POST /api/payroll/calculate` smoke test in step 10.
- **Generated client committed by accident.** Mitigation: add `prisma/generated` to `.gitignore` before the first `prisma generate` run; the implementer should confirm with `git status` after step 8.
- **`@auth/prisma-adapter` removal breaks a future use of it.** Mitigation: `rg "@auth/prisma-adapter"` confirms zero current uses. If `next-auth` is later wired to a Prisma adapter, the v7-compatible path is a future task.
- **CI without a DB.** Mitigation: keep `migrate deploy` only inside the developer-facing `db:setup`. CI continues to use `prisma generate` + `tsc` + `vitest` + `next build`, none of which need a live DB.
- **v7 requires `output`; old habits die hard.** Mitigation: the generator block change is a one-time fix documented in the schema. A short comment in the schema explains why `output = "./generated"` exists so a future editor doesn't "clean it up."
- **Next.js `16.3.3` → `16.3.4` is patch-level, but it touches `sharp`/AVIF (re-enables AVIF Image Optimization).** If the app ingests user-supplied AVIF images, re-validate the image path. This app does not appear to use `next/image` with user uploads (only PDFs via `@react-pdf/renderer`), so the practical risk is low. Mitigation: smoke-test the dashboard and reports pages that render images; no image uploads means no new attack surface.

## Validation checklist (pass criteria for "smooth")
- [ ] `npm install` completes with no peer-dep errors and `postinstall` succeeds.
- [ ] `prisma/generated/client/` is created and gitignored.
- [ ] `next` resolves to `16.3.4`; `eslint-config-next` resolves to `16.3.4`.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes.
- [ ] `prisma/migrations/<timestamp>_init/migration.sql` exists and contains DDL for all four models.
- [ ] `npm run db:setup` against a fresh DB seeds successfully.
- [ ] `npm run dev` boots; `POST /api/payroll/calculate` returns 200.
- [ ] `next build` completes with no new warnings versus the `16.3.3` baseline.
- [ ] `rg "@auth/prisma-adapter"` returns zero matches.
- [ ] `rg "prisma-client-js"` returns zero matches.
- [ ] `prisma/generated/` is not in the git index.

## Open questions
None. The decisions above are sufficient to execute.

## Out of scope (explicit)
- Prisma Composer adoption (Module/service/RPC restructure).
- Driver adapters (`@prisma/adapter-pg`).
- Multi-schema Postgres layouts or PgBouncer.
- Changing the payroll calculation logic or any API route semantics.
- Commit, push, or PR creation (per repo's "only commit when asked" rule).
- Removing `prisma.$disconnect()` from the seed (works either way; lower-risk to leave it).
- A Next.js major-version jump (e.g. 17+). None exists as of this plan's date; 16.3.x is the current Active LTS line. Plan a major bump only when Vercel publishes it.
