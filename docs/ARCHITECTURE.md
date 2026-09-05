# Architecture

This document describes how WizTech Payroll Web is wired together: the layers, the
data flow, the request lifecycle, and the design decisions that hold the system
together.

---

## 1. Layered Overview

The application follows a clean four-layer split, with **strict top-down
dependencies** (a lower layer never imports from a higher one):

```overview
┌────────────────────────────────────────────────────────────────┐
│                        UI / Pages                              │
│  (Next.js App Router pages — src/app/<feature>/page.tsx)        │
│                                                                │
│  All interactive pages are React Client Components.             │
│  They own local state and call the API via fetch().            │
└────────────────────────────────┬───────────────────────────────┘
                                 │ HTTP / fetch()
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                       API Routes                               │
│  (Next.js Route Handlers — src/app/api/.../route.ts)            │
│                                                                │
│  Each route: validates input with Zod, runs business logic,     │
│  writes to the DB via Prisma, emits an AuditLog entry.          │
└────────────────────────────────┬───────────────────────────────┘
                                 │ Function call (in-process)
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                  Domain / Calculation Engine                   │
│  (src/lib/payroll-engine.ts)                                    │
│                                                                │
│  Pure TypeScript. No I/O, no Prisma, no Next.js.               │
│  All payroll math lives here. Unit-tested with Vitest.          │
└────────────────────────────────┬───────────────────────────────┘
                                 │ Prisma 7 Driver Adapter
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                       Data Layer                               │
│  (Prisma 7 + PostgreSQL via @prisma/adapter-pg)                 │
│                                                                │
│  Models: Employee, PayrollRecord, AuditLog, Settings.           │
│  Migrations under prisma/migrations/. Seed in prisma/seed.ts.   │
└────────────────────────────────────────────────────────────────┘
```

**Why this shape?**

- The **engine is pure and isolated** so it can be tested exhaustively without
  a database, and reused if we ever need a CLI or a serverless worker.
- The **API layer is thin** and is the *only* place that knows about HTTP, Zod
  schemas, sessions, and the database. Swapping the UI (e.g. to a mobile app) is
  a non-event.
- The **UI is dumb** — it owns presentation and local interaction state, but
  *no business rules*. If you find yourself writing tax math in a page component,
  that math belongs in the engine.

---

## 2. Directory Layout

```folderstructure
payroll-web/
├── prisma/
│   ├── schema.prisma              # Data model
│   ├── migrations/                # Versioned schema changes
│   └── seed.ts                    # Reference data (PAYE bands, etc.)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (font, nav, globals)
│   │   ├── page.tsx               # Redirect → /dashboard
│   │   ├── globals.css            # Tailwind v4 + custom component classes
│   │   ├── login/page.tsx         # Login form
│   │   ├── dashboard/page.tsx     # KPIs + charts
│   │   ├── employees/page.tsx     # CRUD
│   │   ├── payroll/page.tsx       # Calculate → validate → save
│   │   ├── payslips/page.tsx      # Per-employee payslip + print
│   │   ├── reports/page.tsx       # CSV/Excel export
│   │   ├── settings/page.tsx      # Tabbed settings UI
│   │   ├── users/page.tsx         # User management (ADMIN+)
│   │   └── api/
│   │       ├── auth/login/route.ts
│   │       ├── auth/logout/route.ts
│   │       ├── auth/me/route.ts
│   │       ├── auth/forgot-password/route.ts
│   │       ├── auth/reset-password/route.ts
│   │       ├── audit-logs/route.ts
│   │       ├── businesses/route.ts
│   │       ├── businesses/[id]/route.ts
│   │       ├── dashboard/route.ts
│   │       ├── employees/route.ts
│   │       ├── employees/[id]/route.ts
│   │       ├── fbt/route.ts
│   │       ├── payroll/route.ts
│   │       ├── payroll/calculate/route.ts
│   │       ├── payslips/[id]/route.ts
│   │       ├── reports/route.ts
│   │       ├── settings/route.ts
│   │       ├── users/route.ts
│   │       └── users/[id]/route.ts
│   ├── components/
│   │   └── MainNav.tsx            # Sidebar + mobile bottom nav
│   └── lib/
│       ├── payroll-engine.ts      # Pure domain logic
│       ├── payroll-engine.test.ts # Vitest suite (~30 tests)
│       ├── prisma.ts              # Prisma client singleton
│       └── utils.ts               # cn() class-merger
├── docs/                          # ← you are here
└── package.json
```

---

## 3. Data Flow — A Payroll Run End-to-End

The most representative request flow is **"run payroll for August 2026"**.
Walking through it shows how every layer collaborates:

```dataflow
User clicks "Run Payroll" on /payroll
  │
  ▼
Client (src/app/payroll/page.tsx)
  │   POST /api/payroll  { payrollPeriod: "2026-08" }
  │
  ▼
Route Handler (src/app/api/payroll/route.ts)
  │  1. Parse + Zod-validate body.
  │  2. Load all Settings rows, filter by effectiveFrom ≤ period end.
  │  3. Build StatutoryConfig:
  │        buildStatutoryConfigFromSettings(settingsMap)
  │  4. Load all active employees with `salaryFrequency = 'Monthly'`.
  │  5. For each employee, call engine:
  │        calculatePayroll({ basicSalary, allowances, ... }, config)
  │  6. Refuse if any PayrollRecord already exists for the period
  │     (also enforced by @@unique([payrollPeriod, employeeId])).
  │  7. Bulk-create PayrollRecord rows + one AuditLog in a transaction.
  │
  ▼
Engine (src/lib/payroll-engine.ts)
  │   calculatePAYE → progressive band math
  │   calculatePensionEE / calculatePensionER (capped)
  │   calculateTEVETLevy
  │   calculateOvertimePay (period-aware)
  │   calculateGrossEarnings, calculateNetPay, calculateEmployerCost
  │   → returns { grossEarnings, paye, pensionEE, ..., netPay, employerCost }
  │
  ▼
Prisma 7 Driver Adapter
  │   BEGIN TRANSACTION
  │   INSERT payroll_records (n rows) WITH configSnapshot
  │   INSERT audit_logs (1 row, action = 'PAYROLL_RUN')
  │   COMMIT
  │
  ▼
HTTP 200 { success: true, data: { runDate, count, totalGross, ... } }
  │
  ▼
Client renders success state, refreshes the page.
```

Every step is **testable in isolation**:

- The engine is unit-tested.
- The route handler is type-checked and the SQL is exercised by the dev DB.
- The client has no business logic worth testing — if you find yourself reaching
  for a snapshot test, the logic probably belongs in the engine.

---

## 4. State Management

There is **no global state store** (no Redux, Zustand, or Context). The app
deliberately uses three patterns:

| Pattern | Where it's used | Why |
| --- | --- | --- |
| **Local `useState`** | Form fields, modal open/close, list selection, filters | Keeps the data flow obvious; each page is self-contained. |
| **URL search params** | The dashboard's `period` selector, the reports `type` selector | A reload or a shared link preserves the view. |
| **Server state via `fetch()` in `useEffect`** | Every page load | The DB is the single source of truth; we don't try to mirror it client-side. |

The trade-off is duplicate fetches (e.g. four pages each ask `/api/dashboard` for
the available periods). This is acceptable for a tool used by a small team
behind a VPN; for higher scale, see [`IMPROVEMENTS.md`](./IMPROVEMENTS.md#13)
for the SWR/React-Query migration path.

---

## 5. Validation

- **API request bodies** are validated with **Zod** schemas declared inline in
  each route file. The schema is the *contract* — `employees/route.ts` exposes
  `employeeSchema` and `updateEmployeeSchema`; the client pages construct plain
  `fetch()` calls and trust the server to reject malformed input.
- **API responses** use a uniform shape: `{ success: boolean, data?, error?, details? }`.
  On a `ZodError`, `details` is a flattened field-error map the client can render
  next to form fields.
- **Form fields** are validated client-side with light inline checks (required,
  format). The server-side Zod schema is the authoritative gate.

---

## 6. Auth (Current State)

The application uses a **custom session system** (not `next-auth`).

**Flow:**

```Auth
User → /login (credentials form)
        ↓ POST /api/auth/login
  createSession(userId) → SHA-256 token hash stored in Session row
         ↓ Set-Cookie: __Host-payroll_session (HttpOnly, SameSite=Lax)
  Proxy (src/proxy.ts) → blocks /api/* for unauthed requests
        ↓
  Route handlers → getSessionContext(request) resolves SessionContext
        ↓
  AuditLog.user = session.user.id
```

**Key files:**

- `src/lib/auth/session.ts` — `createSession`, `validateSessionToken`,
  `invalidateSession`, `invalidateAllSessionsForUser`.
- `src/lib/auth/rate-limit.ts` — DB-backed `RateLimit` model; 5 attempts
  per 15-minute window per client key.
- `src/lib/auth/cookies.ts` — `setSessionCookie` / `clearSessionCookie`.
- `src/lib/audit.ts` — `logAuditEvent(event, tx?)`; accepts an optional
  Prisma transaction client so audit writes abort the transaction on
  failure.
- `src/proxy.ts` — Next.js 16 proxy; checks cookie presence only (no
  Prisma). Full session validation happens in route handlers.

**Note:** `next-auth` was pre-installed but intentionally unused. The custom
session system supersedes it. The `next-auth` dependency has been removed
from `package.json`.

---

## 7. Persistence

- **ORM**: Prisma `7.10.0`.
- **Driver**: PostgreSQL via `@prisma/adapter-pg` (Prisma 7 driver-adapter model;
  the `pg` driver is used directly, not via the legacy Prisma engine).
- **Client location**: Generated to `prisma/generated/client` (configured in
  `prisma.config.ts`), not the default `node_modules/@prisma/client`. The
  `@prisma/client` runtime package is still installed and re-exports from there.
- **Singleton**: `src/lib/prisma.ts` exports a singleton in dev (HMR-safe) and
  a fresh instance in production. `next.config.ts` lists `@prisma/client` under
  `serverExternalPackages` so it is never bundled.

### Soft Delete

Employees are never hard-deleted. `DELETE /api/employees/:id` flips
`isActive = false` and `employmentStatus = 'Inactive'`. Historical
`PayrollRecord` rows therefore remain queryable and accurate.

### Audit Trail

Every mutation — `CREATE`, `UPDATE`, `DEACTIVATE`, `PAYROLL_RUN` — emits an
`AuditLog` row. `oldValue` and `newValue` are JSON-stringified snapshots for
diffability. `ipAddress` and `userAgent` are populated by the auth helpers
(`src/lib/audit.ts`) on every audited request.

---

## 8. Styling & UI Conventions

- **Tailwind v4** via `@tailwindcss/postcss`. Theme tokens declared with the
  `@theme` directive in `globals.css` (not a `tailwind.config.js`).
- **Custom utility classes** (`.btn-primary`, `.btn-secondary`, `.btn-danger`,
  `.input`, `.card`, `.badge-success`, `.badge-warning`, `.table`, etc.) are
  defined in `globals.css` and used consistently across pages.
- **Icons**: `lucide-react` everywhere; some pages re-declare a small `Info`
  / `AlertCircle` / `XCircle` SVG locally — these are slated to be replaced
  with the matching `lucide-react` components (see IMPROVEMENTS).
- **Print**: `MainNav` is `print:hidden`; payslips inject a runtime print
  stylesheet for a clean hardcopy.

---

## 9. Testing

- **Engine tests** live next to the engine (`payroll-engine.test.ts`) and
  cover the math edge-cases (band boundaries, pension cap, period-aware
  overtime, effective-dated settings).
- **No API or component tests yet** — this is a tracked gap.

```bash
npm run test         # vitest run, all engine tests
```

---

## 10. Key Design Decisions and Why

| Decision | Rationale |
| --- | --- |
| **Engine is pure (no I/O)** | Makes it exhaustively unit-testable and reusable outside Next.js. |
| **Statutory config is data, not code** | Malawi can (and does) change rates; loading them from `Settings` means the system can be re-tuned without a deploy. |
| **Each `PayrollRecord` snapshots its config** | A payslip from 2024 must reproduce its own numbers even after the 2026 rate change. |
| **`Settings.effectiveFrom` selects at period end** | New rates take effect from the start of a pay period, not "now". |
| **Soft delete only** | Hard-deleting an employee would orphan their historical payslips and break audits. |
| **All pages are client components** | A pragmatic choice for a small tool; server components would shrink bundles but require every page to be restructured. The trade-off is acknowledged in IMPROVEMENTS. |
| **Zod at the API edge, not in forms** | One source of truth for the contract; lighter client-side validation. |
| **No global store** | The DB is the source of truth; client state is presentation-only. |
| **Prisma 7 with driver adapter** | The new architecture decouples Prisma from the query engine binary; cleaner for serverless deploys and edge runtimes. |

---

## 11. Request Lifecycle Cheat-Sheet

| Step | File(s) | What happens |
| --- | --- | --- |
| 1. User navigates | `src/components/MainNav.tsx` | `pathname` determines active link; sidebar renders. |
| 2. Page mounts | `src/app/<page>/page.tsx` | Client component fires fetches in `useEffect`. |
| 3. Fetch | `fetch('/api/...')` | Sends JSON; awaits typed response. |
| 4. Route handler | `src/app/api/.../route.ts` | Zod-validates, calls engine, writes to Prisma, emits `AuditLog`. |
| 5. Engine | `src/lib/payroll-engine.ts` | Pure math, returns `PayrollResult`. |
| 6. Persistence | `src/lib/prisma.ts` → PostgreSQL | Driver adapter executes SQL. |
| 7. Response | `{ success, data }` | JSON returned with correct status. |
| 8. Render | Client `useState` | UI updates; charts re-render; toast or alert shown. |

That's the whole machine. When you change one part, the others stay isolated —
that's the design goal.
