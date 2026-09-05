# Stack, Tools & Dependencies

This document lists every tool, framework, and package in the project, **what
role it plays**, and **why it was chosen for this specific app**.

---

## 1. Frameworks & Runtime

### Next.js 16 (`next@16.3.4`)
- **Role**: The full-stack web framework — App Router, route handlers, server
  components, Turbopack dev server, build, and image optimization.
- **Why here**:
  - We need **server-side route handlers** (`src/app/api/.../route.ts`) and
    **client-side pages** in one codebase. Next.js App Router gives us both
    with zero glue code.
  - **Turbopack** is the default in Next 16 — sub-second HMR keeps the inner
    dev loop fast, which matters because the dashboard has 4 large charts.
  - **React Server Components** are available when we choose to use them
    (today most pages are client components — see IMPROVEMENTS for the
    planned migration).
  - The `next.config.ts` `serverExternalPackages: ['@prisma/client']` setting
    is the official way to keep the Prisma client out of the bundle.

### React 19.2 (`react`, `react-dom`)
- **Role**: UI rendering. Pages and components.
- **Why here**:
  - New `useActionState` / `useOptimistic` hooks are useful for the payroll
    "Calculate → Validate → Save" workflow when we migrate away from
    `useState`-based state machines.
  - Strict mode + concurrent rendering help the chart-heavy dashboard.

### TypeScript ^5 (strict)
- **Role**: Static typing for every `.ts` / `.tsx` file.
- **Why here**:
  - **Money math is dangerous**. The strict mode `noImplicitAny` +
    `strictNullChecks` settings force every `Decimal` to be handled
    deliberately; the engine's `Number()`-coercion guards were added
    specifically because the type system exposed the silent string-concat
    footgun.
  - Zod-inferred types (`z.infer<typeof employeeSchema>`) give end-to-end
    type safety from API contract to form state.

### Node.js 20+
- **Role**: Runtime for `next dev`, `next build`, and `prisma` CLI.
- **Why here**: Required by Next 16; matches the host environment.

---

## 2. Database & ORM

### Prisma 7 (`prisma@7.10.0`, `@prisma/client@7.10.0`)
- **Role**: Schema, migrations, type-safe client.
- **Why here**:
  - **Migrations** (`prisma/migrations/`) are checked into git and applied
    with `prisma migrate deploy` — critical for a payroll system that must
    produce reproducible history.
  - **Generated client** lives in `prisma/generated/client` (Prisma 7
    style — configured in `prisma.config.ts`), and the singleton in
    `src/lib/prisma.ts` is HMR-safe in dev.
  - Prisma's `Decimal` type is used for **all money fields**, which is the
    correct way to store currency in Postgres. The engine's defensive
    `Number()` coercion bridges Decimal → JS number for math.

### PostgreSQL
- **Role**: The system of record.
- **Why here**:
  - Mature, transactional, well-understood.
  - `Decimal`/`numeric` first-class.
  - `Json` column type used for `PayrollRecord.configSnapshot` (audit trail
    of the rules used at run-time).

### `@prisma/adapter-pg@7.10.0` + `pg@^8.23.0`
- **Role**: The Prisma 7 **driver adapter** for PostgreSQL.
- **Why here**:
  - Prisma 7 separates the *client API* from the *driver*; the new
    adapter model lets us use the standard `pg` driver (or `pgBouncer`,
    or Neon, or any pg-compatible transport) without the legacy
    Rust-based query engine binary.
  - The combination works in serverless and edge runtimes where the old
    engine binary was a deployment pain point.

### `dotenv@^17`
- **Role**: Loads `.env` for `prisma.config.ts` and `prisma/seed.ts`.
- **Why here**: Standard Prisma pattern; explicit dependency because
  Prisma 7 reads `DATABASE_URL` via `dotenv` in user-land config.

### `tsx@^4.23.12`
- **Role**: Runs `prisma/seed.ts` (TypeScript) via the `prisma:seed` script.
- **Why here**: Lets us write the seed in TypeScript without a build step.

### `bcryptjs`
- **Role**: Password hashing and verification for application users.
- **Why here**: Provides a battle-tested adaptive password hash without storing
  plaintext credentials; the auth foundation uses 10 salt rounds.

### Node.js `crypto`
- **Role**: Generates opaque session and password-reset tokens and hashes them
  with SHA-256 before persistence.
- **Why here**: Keeps bearer tokens out of the database while using the platform
  cryptography implementation and HttpOnly cookies.

---

## 3. UI & Styling

### Tailwind CSS v4 (`tailwindcss@^4`, `@tailwindcss/postcss@^4`)
- **Role**: Utility-first CSS.
- **Why here**:
  - v4's `@theme` directive in `globals.css` replaces the JS config file —
    a cleaner fit for a TypeScript-only repo.
  - The custom component classes (`.btn-primary`, `.input`, `.card`, …) are
    defined alongside the theme tokens, so the *whole* design system lives
    in one file.
  - Excellent DX for the dashboard's many slightly-different cards.

### `clsx@^2.1.1` + `tailwind-merge@^2.5.4`
- **Role**: `cn(...inputs)` in `src/lib/utils.ts` — combines conditional
  classes while resolving Tailwind conflicts (`p-2` vs `p-4`).
- **Why here**: De-facto standard; trivially small; no alternative is
  meaningfully better.

### `lucide-react@^0.446.0`
- **Role**: All icons (sidebar, KPI cards, modals, charts).
- **Why here**:
  - Open-source (ISC), tree-shakable, no font dependency.
  - Consistent stroke width and sizing — the navbar and the empty states
    look like they were drawn by the same person.
  - The project also has **3 hand-rolled SVG icons** (`Info`, `AlertCircle`,
    `XCircle`) duplicated in 3 page files — slated to be replaced with
    `lucide-react` equivalents (see IMPROVEMENTS).

### `recharts@^2.15.0`
- **Role**: Dashboard charts — Bar, Area, Pie, Line.
- **Why here**:
  - React-first, declarative API matches the rest of the app.
  - No canvas dependency; renders to SVG which prints cleanly if a user
    ever prints the dashboard.
  - The composition model (`<ResponsiveContainer>`, `<Bar>`, `<XAxis>`)
    composes nicely with the existing Tailwind layout.

---

## 4. Validation, Forms & Data Contracts

### `zod@^3.23.8`
- **Role**: Schema validation at every API boundary.
- **Why here**:
  - **One source of truth for the request contract**. Each route declares
    `const schema = z.object({...})` and the *type* of the parsed body is
    inferred: `const body = schema.parse(await req.json())`.
  - The same schema can later be reused client-side for form validation.
  - `ZodError` is mapped to HTTP 400 with `details` containing a per-field
    error map; the client surfaces those next to inputs.
  - `z.coerce.number()` handles HTML form inputs (which are always strings)
    safely.

---

## 5. Authentication (Custom Session System)

The project originally planned to use `next-auth@5` (see below), but a
custom session system was built instead. The custom system is now
production-active.

### `next-auth` (removed)

`next-auth@^5.0.0-beta.25` was pre-installed but never wired up — no
`app/api/auth/[...nextauth]/route.ts`, no `auth()` calls anywhere in the
codebase. The custom session system supersedes it entirely. The dependency
has been removed from `package.json`, which also eliminates the
`@auth/core → nodemailer` transitive vulnerability path.

### Custom session system

- **Session storage**: `Session` model in Prisma; only a SHA-256 token
  hash is persisted (never the raw token).
- **Token lifetime**: 24 hours. Expired or inactive-user sessions are
  rejected by `validateSessionToken` and deleted.
- **Cookie**: `__Host-payroll_session`, HttpOnly, SameSite=Lax, Secure in
  production.
- **Rate limiting**: `RateLimit` model; 5 attempts per 15-minute window
  per client key (`IP + User-Agent`).
- **Password hashing**: `bcryptjs` at 10 rounds.
- **Token generation**: `node:crypto` `randomBytes(32)` for session and
  password-reset tokens; SHA-256 hashed before storage.

---

## 6. PDF & Reporting

---

## 6. Testing

### `vitest@^3.0.8`
- **Role**: Unit tests for `payroll-engine.ts` (~30 tests).
- **Why here**:
  - **The engine is the highest-risk code** (money math). It deserves
    a real test runner.
  - Vitest's watch mode + ESM-native runner is the modern default;
    the rest of the repo is ESM-first (Prisma 7, Next 16) so vitest
    fits without config.
  - Currently `npm run test` runs `vitest run` (single pass, CI-ready).

### `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg`
- **Role**: Type definitions for Node, React, React DOM, and the `pg`
  driver (consumed by the Prisma adapter).
- **Why here**: Required by TypeScript; pinned in `devDependencies`.

---

## 7. Linting

### `eslint@^9` + `eslint-config-next@16.3.4`
- **Role**: Lint rules, including `core-web-vitals` and TypeScript
  rules from `eslint-config-next`.
- **Why here**: Next 16 ships with the v9 flat config; the included
  rules catch the highest-ROI issues (broken `<a>` tags, missing
  `<Image alt>`, untyped props).
- **Known friction**: The `react-hooks/set-state-in-effect` rule is
  explicitly disabled in 4 page files. This is tracked in IMPROVEMENTS
  — the right fix is to refactor the fetchers, not to keep disabling
  the rule.

---

## 8. Build & Bundler Toolchain

| Tool | Role |
| --- | --- |
| `@tailwindcss/postcss` | PostCSS plugin for Tailwind v4. |
| `postcss.config.mjs` | Wires `@tailwindcss/postcss` into Next's CSS pipeline. |
| `next.config.ts` | `serverExternalPackages: ['@prisma/client']`, nothing else. |
| `tsconfig.json` | `strict`, `paths: { "@/*": ["./src/*"] }`, target ES2017. |
| `prisma.config.ts` | Prisma 7 config: env loading, migrations, seed command. |

---

## 9. Scripts (`package.json`)

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Start the dev server with Turbopack HMR. |
| `build` | `next build` | Production build. |
| `start` | `next start` | Run the production build. |
| `lint` | `eslint` | Lint check. |
| `test` | `vitest run` | Run engine unit tests. |
| `postinstall` | `prisma generate` | Re-generate the Prisma client after `npm install`. |
| `prisma:generate` | `prisma generate` | Manually regenerate the client. |
| `prisma:migrate` | `prisma migrate dev` | Create + apply a new migration in dev. |
| `prisma:deploy` | `prisma migrate deploy` | Apply pending migrations in prod. |
| `prisma:seed` | `prisma db seed` | Run `prisma/seed.ts` (loads reference data). |
| `db:setup` | `prisma migrate deploy && prisma db seed` | One-shot setup for new environments. |

---

## 11. Why These Choices Make the App Special

A short summary of how the **stack** supports the **app's special qualities**
listed in [`README.md`](./README.md#why-this-app-is-special):

- **Statutorily correct, locally-aware** → Prisma's `Decimal` + a pure
  TypeScript engine + Zod-validated boundaries.
- **Historically reproducible** → Prisma 7 migrations + `Settings.effectiveFrom`
  + per-row `configSnapshot` JSON.
- **Period-aware** → `getWorkingDaysInMonth` + per-month settings selection.
- **Decimal-safe** → The engine's `Number()` guards exist *because* we use
  Prisma `Decimal`. The dependency choice *creates* the need and the
  solution lives in the same code path.
- **Zero-dependency engine** → A pure module is unit-testable in milliseconds
  with Vitest; no need for a database to verify math.
- **Auditable** → `AuditLog` table + Prisma transactions = a guarantee that
  the audit row and the data row commit together.
- **Modern, type-safe** → TypeScript strict + Zod end-to-end types + Prisma
  generated types = the compiler catches most of the bugs that would
  otherwise surface in payroll.

Every choice above is in service of one of those qualities. If a new tool
doesn't make at least one of them better, it doesn't belong here.
