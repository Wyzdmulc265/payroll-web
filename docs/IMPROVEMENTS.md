# Repository Audit & Improvement Recommendations

This document is a thorough, prioritized audit of the WizTech Payroll
Web codebase as it stands. Each finding is labeled by severity
(🔴 critical, 🟠 high, 🟡 medium, 🟢 low) and points at concrete
files and line numbers so a fix can be planned without re-discovering
the context.

The companion `docs/changes/` folder is where each fix lands (one
file per change); `docs/bugsfix/` is for user-reported bugs and their
fixes.

---

## 🔴 Critical

### ~~1. No authentication or authorization~~ (resolved in Phase 7)

> **Status:** Resolved. A custom session system is now in place (not
> `next-auth`). All API routes require authentication and authorization;
> `src/middleware.ts` (via `src/proxy.ts`) blocks unauthenticated requests.
> The `next-auth` dependency has been removed entirely.

**Files**: every `src/app/api/**/route.ts`.

Every API route is **publicly accessible**. Anyone with the URL can
create, mutate, and delete employees, run payroll, and change
settings. The `next-auth@^5.0.0-beta.25` dependency is installed but
not wired up — there is no `app/api/auth/[...nextauth]/route.ts`,
no middleware, and no `auth()` call.

**Impact**: in a regulated payroll environment, this is a single
high-severity incident waiting to happen.

**Recommended fix:**

1. Add a `Credentials` (email + password) or `Email` provider via
   `next-auth@5` (Auth.js v5).
2. Add `src/middleware.ts` that blocks `/api/*` and any page other
   than `/login` for unauthenticated requests.
3. Replace every literal `'system'` in `AuditLog.user` and
   `PayrollRecord.runBy` with the resolved session identifier.
4. Populate `AuditLog.ipAddress` from the request headers.
5. Add role-based access (admin vs. payroll clerk) before any
   mutating endpoint.

### 2. No CSRF or origin protection on mutating routes

Compounds #1. Without an auth boundary, an attacker can host a page
that drives the user's browser to make POST/PUT/DELETE calls.

**Recommended fix**: Since `next-auth` has been removed, enforce a
same-origin check in middleware (compare `Origin` / `Referer` to the
app's host) or use a `next-safe-action` wrapper.

### 3. `saveToApi` in `settings/page.tsx` fires N parallel POSTs

`src/app/settings/page.tsx` issues **one `POST /api/settings` per
field** in parallel, with no transactionality or batching. A
network blip mid-save leaves `Settings` half-updated.

**Recommended fix**: add a `POST /api/settings/batch` endpoint that
accepts `[{ key, value, ... }, ...]` and writes them in a single
`prisma.$transaction`. Update the client to call it once.

### 4. `DELETE /api/settings` has no audit log entry

`src/app/api/settings/route.ts` `DELETE` handler is the only mutating
route that does **not** write an `AuditLog` row. Settings changes
are the most sensitive mutation in the system; this is a serious
audit gap.

**Recommended fix**: emit an `AuditLog` with `action: 'DELETE'`,
`entityType: 'Settings'`, `entityId: key`, `oldValue: <prior
value>`.

### 5. No `.env.example` is shipped

New contributors have no way to discover that the project needs a
`DATABASE_URL`. `prisma.ts` throws on missing `DATABASE_URL` at
startup, leading to a confusing first-run experience.

**Recommended fix**: add `.env.example` with `DATABASE_URL=`,
`NEXTAUTH_SECRET=`, `NEXTAUTH_URL=`. Update `README.md` to point
at it.

---

## 🟠 High

### 6. Engine math is duplicated in client pages

`src/app/payroll/page.tsx` contains a local `calculateOvertimePay`
and `src/app/settings/page.tsx` contains a local `bandPreviewTax` —
both re-implement math that already exists in
`src/lib/payroll-engine.ts`. If the engine changes (e.g. a band
boundary tweak or a new overtime rule), these will silently drift.

**Recommended fix**: expose `previewOvertimePay(...)` and
`previewPAYE(income, bands)` from the engine, import them in the
pages, and delete the local copies. Add tests in
`payroll-engine.test.ts` to lock the public surface.

### 7. `getWorkingDaysInMonth` does not account for public holidays

`src/lib/payroll-engine.ts` lines 413–424. The counter is a
straight Mon–Fri tally; Malawi's public holidays (e.g. Kamuzu Day,
Independence Day) are not subtracted. This is a documented
simplification; in months with holidays, the hourly rate is
slightly higher than it should be and the OT bill is correspondingly
slightly higher.

**Recommended fix**: add a `malawi_public_holidays` static table
keyed by `YYYY-MM-DD`, subtract those days from the count, and
document the behavior in `ENGINE.md`.

### 8. PAYE band gap/overlap potential in the Settings UI

`buildStatutoryConfigFromSettings` does **not** validate that
`bands[i+1].from === bands[i].to + 1`. A user can create gaps in
the Settings UI; `calculatePAYE` then `find`s no matching band and
silently returns 0.

**Recommended fix**: in the engine, add `validateTaxBands(bands)`
that throws (or returns errors) on gaps, overlaps, or non-monotonic
rates. In the settings UI, call this on save and surface a
user-friendly error.

### 9. Hardcoded department list in `employees/page.tsx` Add modal

The `<select>` for "Department" in the Add/Edit modal is hard-coded
to `IT / Finance / HR / Sales / Admin` (around line 506). If a
user adds an employee with a different department via the API, the
modal will refuse to open it (the value won't match any option).

**Recommended fix**: load the department list from the
`fetchEmployees` result (departments are already extracted) and
render a dynamic `<select>`.

### 10. `/api/payroll` POST race condition on `existingCount`

The pre-flight `count > 0` check followed by a separate
`createMany` opens a small window where two concurrent runs can
both pass the check. The DB has `@@unique([payrollPeriod, employeeId])`
which will fail one of the runs with a constraint error, but the
error is then surfaced to the user as a generic 500.

**Recommended fix**: rely on the unique constraint and wrap the
`createMany` in `prisma.payrollRecord.createMany({ data: [...] })`
inside a try/catch that maps `P2002` to a clean
`400 { error: 'Payroll already exists for period …' }`. Or use
`INSERT … ON CONFLICT DO NOTHING` semantics via a transaction with
`SELECT … FOR UPDATE`.

### 11. `pensionApplicable` and `taxStatus` on `Employee` are unused

`Employee.pensionApplicable` (default `true`) is never read by the
engine. `Employee.taxStatus` (default `"Taxable"`) is also never
read — the engine always taxes. Both are dead fields from the
user's perspective.

**Recommended fix**: either implement them in the engine
(`if (!employee.pensionApplicable) pensionEE = pensionER = 0` and
`if (employee.taxStatus === 'Exempt') paye = 0`) or remove them
from the schema. Implementation is the higher-value option.

---

## 🟡 Medium

### 12. Most pages are unnecessarily client components

`dashboard`, `employees`, `payroll`, `payslips`, `reports`, and
`settings` are all `'use client'`. Only the data-loading parts of
each page *need* to be client; the page shells could be server
components that pass data down.

**Recommended fix**: convert page shells (header + layout + static
labels) to server components, keep only the interactive widgets
client-side. Bundle size shrinks, first paint improves, and the
`useEffect` set-state lint disables (see #15) become unnecessary.

### 13. No React Query / SWR / cache layer

Every page re-fetches periods / departments / employees
independently. There are 4 copies of the period-picker that
each fetch `/api/dashboard` to populate the dropdown.

**Recommended fix**: introduce **SWR** (lightest footprint) for
read-only fetches (`/api/dashboard?periods=`, `/api/employees?limit=…`).
Cache key by URL, dedupe across pages.

### 14. `useEffect` + `setLoading` triggers the lint rule

Four page files explicitly disable `react-hooks/set-state-in-effect`.
The current pattern is:

```ts
useEffect(() => { (async () => { setLoading(true); const r = await fetch(...); setData(...); setLoading(false); })(); }, [...]);
```

**Recommended fix**: move the fetch into an event handler (button
click, form submit) or wrap the body in `useTransition`. With SWR
(see #13), this disappears entirely.

### 15. CSV export does not escape formula prefixes (CSV-injection)

`src/app/reports/page.tsx` `exportToCSV` writes cells verbatim. A
cell starting with `=`, `@`, `+`, `-`, `\t`, or `\r` is interpreted
by Excel as a formula — a malicious or even just sloppy value
becomes a remote-code-execution vector when the CSV is opened.

**Recommended fix**: prefix any cell starting with one of those
characters with a single quote (`'`), or use `papaparse` to handle
escaping correctly.

### 16. "Export PDF" misnomer on `/payslips`

The "Export PDF" button calls `window.print()`. The `@react-pdf/renderer`
dependency has been removed (it was unused).

**Recommended fix**: either build a real PDF with
`@react-pdf/renderer` (and email it / archive it from there) or
rename the button to "Print / Save as PDF". <em>(@react-pdf/renderer has
been removed from deps; re-add if implementing.)</em>

### 17. Repeated `<EmployeeForm>` candidate

`src/app/employees/page.tsx`'s Add/Edit modal is ~200 lines and
mixes state, validation, and DOM. Extract to
`src/components/EmployeeForm.tsx`.

### 18. Repeated types

`Employee`, `Setting`, `PayrollRow` are redefined in each page
file. Extract to `src/types/`.

### 19. Repeated period picker

Period picker (`<select>` + native `<input type="month">`) is
duplicated in 4 pages. Extract to `<PeriodPicker />`.

### 20. Repeated local SVG icons

`Info`, `AlertCircle`, `XCircle` are declared locally in
`payroll/page.tsx`, `reports/page.tsx`, and `settings/page.tsx`.
Use `lucide-react` versions (`Info`, `AlertCircle`, `XCircle` all
exist there) and delete the local SVGs.

### 21. `employeeSchema` and `updateEmployeeSchema` are duplicated

In `src/app/api/employees/route.ts`, the create schema and the
update schema are maintained separately. Extract a base schema
and use `.partial()` / `.extend()` for the update.

### 22. Dead `fetchDepartments` in `employees/page.tsx`

`fetchDepartments` is dead code — `fetchEmployees` already
extracts a unique departments list. Remove.

### 23. `EmployeeEarningsHistory` report contract is confusing

The report requires `department` (the report's filter is actually
*employee*) **and** `employeeId`. The UI label says "Department/
Employee". Clean up the contract: rename the query param to
`employeeId` and validate it as required.

### 24. `Settings` upsert clobbers history

`POST /api/settings` upserts by `key`, replacing the prior row. To
preserve historical values (e.g. `statutory.pension_ee_rate` that
was 5% until 2024-07-01 and 6% after), the unique key needs to
become `(key, effectiveFrom)`. The current schema won't allow two
rows for the same key.

**Recommended fix**: add a migration that changes `key @unique` to
`@@unique([key, effectiveFrom])`, and update `selectEffectiveSettings`
semantics (it currently returns the *latest* effective row, which
still works after the change).

### 25. Inconsistent error envelopes

Each page checks `data.success` directly and surfaces errors with
`alert()`. Extract a typed `ApiResult<T>` and a single
`useApi` helper that returns `{ data, error, isLoading }` and
surfaces errors via a toast pattern.

### 26. No tests for API routes or React components

Only the engine is tested. Add a `__tests__/api/` suite using
Vitest + a test DB (or Prisma's mocked client) to lock the
contracts.

### 27. Audit log `oldValue` / `newValue` are JSON-stringified text

Querying for "show me all settings changes where the value went
from X to Y" requires parsing the text column. Switch the column
type to `Json` (or split into a `AuditLogChange` child table) for
proper queryability.

### 28. Duplicate migration name

`20260901055119_payroll_config_snapshot` shares its name with
`20260901054845_payroll_config_snapshot`. Rename the follow-up or
squash them.

### 29. `@types/node` is on `^20` while running Next 16 + Node 20/22

Bump type packages to match the runtime.

### 30. No rate limiting on `/api/payroll/calculate`

The endpoint is public and stateless; a flood of requests is
cheap-to-serve but the JSON serialization isn't free. Add a basic
rate limit (e.g. `next-rate-limit` or a middleware) before auth
is wired.

---

## 🟢 Low / Polish

### 31. `@react-pdf/renderer` ~~is dead weight~~ (removed)

`@react-pdf/renderer` has been removed from `dependencies` — it was
unused. Re-add it only when the "Export PDF" button graduates from
`window.print()` to real PDF generation.

Either implement it (#16) or remove the dep (~MB of bundle).

### 32. `next-auth` ~~is dead weight~~ (removed)

`next-auth@^5.0.0-beta.25` has been removed from `dependencies`. The
custom session system is the active authentication mechanism; `next-auth`
was never wired (no `[...nextauth]` route, no `auth()` calls). Removing
it also closes the `@auth/core → nodemailer` transitive vulnerability.

### 33. No CI config

Add a `.github/workflows/ci.yml` running `npm run lint`,
`npm run test`, `npm run build`.

### 34. `getWorkingDaysInMonth` is TZ-naive

`new Date(year, month - 1, day)` uses local time. For a payroll
system used by distributed teams, switch to UTC consistently.

### 35. No accessibility audit beyond basic `aria-label`

No skip-link, no focus management in modals (other than
`autoFocus`), no live regions for toasts, no text alternative on
charts. Schedule an `axe-core` run.

### 36. Reports page currency hardcoded `MWK` in labels

The format library already uses `config.currency`; the labels
(e.g. "Bank Payment Schedule (MWK)") should be config-driven.

### 37. No internationalization framework

Despite using `Intl.NumberFormat('en-MW', ...)`, there is no
`next-intl` or `react-i18next`. Acceptable for a single-language
tool, but worth flagging.

### 38. Tailwind v4 `@theme` colors not consumed everywhere

`#1e40af` is hardcoded in dashboard chart `COLORS`. Move to the
theme and consume via `var()`.

### 39. `formatCompact` ignores the configured currency

`src/app/dashboard/page.tsx` `formatCompact` hardcodes `MWK`. Use
`formatCurrency` or read from the response's `data.currency`.

### 40. `Employee.formData.basicSalary` is `string` in the form

HTML inputs return strings; `JSON.stringify` sends strings. The
Zod schema's `z.number().positive()` is fragile here — prefer
`z.coerce.number().positive()`.

### 41. `payroll/page.tsx` totals row `<td colSpan={3}>`

Looks correct but should be reviewed alongside the column count
in browser.

### 42. Duplicate type inference between engine and pages

The engine exports `PayrollResult`; the pages redefine a wider
type with extra fields (`formatted`, `period`, etc.). Align.

### 43. No `vitest.config.ts`

Vitest picks up defaults; an explicit config would let you mock
Prisma or set up a test DB.

### 44. `prisma.config.ts` and `prisma/seed.ts` both `import 'dotenv/config'`

Redundant — Prisma 7 already loads it. Remove from the seed.

### 45. `payroll/page.tsx` "Generate Payslips" stub

Replace with a real flow (either navigate to `/payslips?period=…`
or implement a `POST /api/payslips/bulk` that emails PDFs).

---

## Top 5 Quick Wins (Highest ROI)

If you only have time for a few items, do these:

1. **Wire up `next-auth`** and replace every literal `'system'`
   string with the resolved session identifier. Closes the obvious
   security gap, makes the audit trail meaningful, and the upgrade
   is mostly additive (the schema fields already exist).
2. **Move shared PAYE / overtime math back into the engine** and
   import it from settings + payroll pages. Prevents silent drift
   and locks the public surface in tests.
3. **Add a `POST /api/settings/batch` endpoint and a transaction
   wrapper on the client.** Fixes the half-saved settings bug.
4. **Replace `alert()` with the toast pattern already used in
   `settings/page.tsx`.** One component, six pages.
5. **CSV-injection escaping on the reports exporter.** A 5-line
   fix that closes a real Excel-RCE vector.

---

## Suggested Order of Operations

1. Auth (#1, #2) — unblocks the rest of the audit story.
2. `AuditLog` writes on settings (#4).
3. Engine dedup (#6) + engine tests for the new public surface.
4. `.env.example` (#5).
5. CSV-injection fix (#15).
6. Settings batch endpoint (#3).
7. `Settings` history schema (#24).
8. Period picker extraction (#19) and SWR (#13).
9. Component / type extraction (#17, #18, #20, #21).
10. Server-component conversion of page shells (#12).
11. Tests for API routes (#26).
12. CI (#33).

Each of these produces a clean, self-contained change suitable for
a single `docs/changes/<name>.md` entry.
