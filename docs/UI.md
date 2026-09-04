# UI: Pages & Components

This document covers every page in `src/app/` and every reusable
component in `src/components/`. Pages are **client components** — they
own local state and call the API via `fetch()`. They render against
the design system defined in `src/app/globals.css` (custom utility
classes like `.btn-primary`, `.input`, `.card`, `.badge-success`, …).

The root layout (`src/app/layout.tsx`) renders the global font
(`Inter`), the persistent `<MainNav />`, and a `<div>` that
compensates for the fixed sidebar (`lg:ml-64`) and the mobile bottom
nav (`pb-24`). Both are `print:hidden` so payslips print clean.

---

## 1. The Persistent Shell

### `src/app/layout.tsx`

- Inter font, gray-50 background, `antialiased`.
- `metadata`: `title: 'WizTech Payroll'`,
  `description: 'Malawi Payroll Management System'`.
- Renders `<UserProvider />` (from `src/components/UserContext.tsx`) to
  provide the current user to the nav and pages.
- Renders `<MainNav />` once for the whole app.
- The content `<div>` has `print:ml-0 print:pb-0` to remove the
  sidebar offset when printing.

### `src/app/page.tsx`

Server component, just `redirect('/dashboard')`.

### `src/components/MainNav.tsx`

Single source of nav. Renders **two** presentations of the same links:

| Variant | Breakpoint | Layout |
| --- | --- | --- |
| **Sidebar** | `lg:flex` | Fixed left, `w-64`, scrollable, with a "WizTech Payroll / Malawi" brand header. |
| **Bottom bar** | `lg:hidden` | Fixed bottom, 6-column grid, mobile-friendly icons + labels. |

**Auth-aware hiding**: when `pathname` matches `/login`,
`/forgot-password`, or `/reset-password/*`, `MainNav` returns
`<>{children}</>` with no sidebar and no layout offset. Auth pages
therefore do not need their own layout wrapper.

**Role-aware variant for SUPER_ADMIN**: when `useCurrentUser().role === 'SUPER_ADMIN'`,
the nav is replaced with a focused 4-tab experience: **Home · Business
Management · Settings · Audit Logs**. The SUPER_ADMIN tab list does not
pass through the `requiresBusiness` filter (SUPER_ADMIN has no
`businessId` by design). All other roles see the same permission-filtered
nav as before.

**Active state** is derived from `usePathname()`:
`pathname === href || pathname.startsWith(href + '/')`. Icons come
from `lucide-react` (TrendingUp, Users, Calculator, FileText,
BarChart3, Settings, Building2, UserCog, ScrollText).

**Both variants are `print:hidden`.**

---

## 2. The Design System

`src/app/globals.css` defines a Tailwind v4 `@theme` block and a small
set of custom utility classes. Every page uses them — no inline
hardcoded button styles.

| Class | Purpose |
| --- | --- |
| `.btn-primary` | Filled blue button. |
| `.btn-secondary` | Outlined button. |
| `.btn-danger` | Red destructive button. |
| `.input` | Bordered text/number input. |
| `.card` | White panel with border + shadow. |
| `.badge-success` / `.badge-warning` / `.badge-danger` / `.badge-info` | Pill labels. |
| `.table` + `.table-header` + `.table-cell` | Tabular data. |

The icons are universally from `lucide-react` (with the documented
exceptions in [`IMPROVEMENTS.md`](./IMPROVEMENTS.md#20)).

---

## 3. Pages

### 3.1 `/dashboard` — `src/app/dashboard/page.tsx`

**What it shows:** High-level KPIs for a selected pay period,
plus four charts (department bar, 12-month area, distribution pie,
headcount line) and a department roll-up table. Includes a **Total FBT**
KPI card and per-department FBT column.

**State:**
- `dashboardData` — `null` until the first fetch completes.
- `periods` — distinct `payrollPeriod` values from
  `GET /api/dashboard` (no-period mode).
- `selectedPeriod` — defaults to the current calendar month
  (e.g. `2026-09`).
- `loading`.

**Fetchers:**
1. `GET /api/dashboard` → fills `periods`.
2. `GET /api/dashboard?period=...` → fills `dashboardData`.

**Notable UI bits:**
- `formatCompact` helper for chart axes (B / M / K).
- The pie chart's `COLORS` array is hard-coded — see IMPROVEMENTS to
  move into the theme.

### 3.2 `/employees` — `src/app/employees/page.tsx`

**What it shows:** A paginated, searchable, filterable employee
table, with an "Add / Edit" modal and a "Deactivate" confirmation
dialog.

**State:**
- `employees` + `pagination`.
- `search`, `department`, `status`, `page`, `limit`.
- `showModal`, `editingEmployee` (null = add mode).
- `formData` (typed) + `errors`.
- `showDeleteConfirm`, `deletingEmployee`.

**Fetchers:** `GET /api/employees?page=…&search=…&department=…&status=…`,
`POST`, `PUT`, `DELETE`.

**Department list:** the filter `<select>` and the Add/Edit modal offer the
union of departments configured in Settings → Company
(`company.departments`) and departments already seen on employees, so a
department can be pre-defined before anyone is hired into it. On a business
with neither, the modal hints to add departments in Settings.

**Known issues** (see IMPROVEMENTS):
- The modal is ~200 lines; should be extracted as `<EmployeeForm />`.

### 3.3 `/payroll` — `src/app/payroll/page.tsx`

**The flagship workflow page.** Five-step state machine:
`idle → loaded → calculated → validated → saved` (with an `error`
branch).

| Step | What happens |
| --- | --- |
| 1. **Load** | User picks a period and clicks "Load". Page calls `GET /api/employees` (limit 100) and renders a row per employee with inputs for overtime hours, bonuses, other earnings, and other deductions. The table also shows `FBT Base` and `FBT` columns (calculated locally via `calculatePayroll`). |
| 2. **Calculate** | User clicks "Calculate". The page calls `calculatePayroll` **locally** (a local re-implementation of `calculateOvertimePay` exists to avoid a round-trip — see IMPROVEMENTS to refactor and import from the engine). FBT is computed via `calculateEmployerFBT` when fringe benefits are present. |
| 3. **Validate** | The page runs `validatePayrollInput` over each row and surfaces inline error badges. |
| 4. **Save** | User clicks "Save". Page POSTs to `/api/payroll` with the `overtimeData` array. The server persists `PayrollRecord`s in a transaction. |
| 5. **Generate Payslips** | Currently a stub `alert('Coming soon')`. Should hit `/api/payslips` (or a new bulk endpoint). |

**Fetchers:** `GET /api/employees`, `POST /api/payroll`.

**Other notes:**
- The page declares its own local `Info` SVG icon — see IMPROVEMENTS
  to replace with `lucide-react`.

### 3.4 `/payslips` — `src/app/payslips/page.tsx`

**What it shows:** A two-step selector (period + employee), then a
formatted payslip and "Print" / "Export PDF" buttons. The Employer
Contributions section includes an **Employer FBT** subsection (base,
rate, tax) when FBT is present for the period.

**Fetchers:** `GET /api/payslips/:id?period=YYYY-MM`.

**Print flow:**
- On "Print" or "Export PDF", the page calls `window.print()`.
- A print stylesheet is **injected at runtime** (a `<style>` tag in
  the DOM) so the page works without server config.
- The "Export PDF" button is a misnomer — it just prints to PDF via
  the browser's print dialog. The declared `@react-pdf/renderer`
  dep is unused; see IMPROVEMENTS to either wire it up or remove it.

**Other notes:**
- The "employee" dropdown is populated from `GET /api/employees`
  (limit 200). Departments are not filtered.

### 3.5 `/reports` — `src/app/reports/page.tsx`

**What it shows:** A report-type picker, a period picker, an
optional department picker, and a "Generate" button. On submit,
fetches `GET /api/reports?type=…&period=…&department=…` and renders
the resulting table. Two export buttons:

| Button | Output |
| --- | --- |
| **Export CSV** | Builds a CSV string client-side, escapes cells, downloads via a blob. |
| **Export Excel** | Writes an HTML table into an `.xls` file (Excel's HTML-table import path). |

**Local icons** (`Info`, `AlertCircle`) are defined inline — should
be replaced with `lucide-react` versions (see IMPROVEMENTS).

**Known issue** — the CSV exporter does **not** escape formula
prefixes (`=`, `@`, `+`, `-`, tab, CR). A column value like `=cmd|'/c calc'!A1`
will execute when opened in Excel. See IMPROVEMENTS.

### 3.6 `/settings` — `src/app/settings/page.tsx`

**Two role-branched layouts** sharing a single page file:

**Tenant branch** (ADMIN / PAYROLL_OPERATOR / VIEWER) — a tabbed UI with five tabs:

| Tab | What it edits |
| --- | --- |
| **COMPANY** | `company_name`, `company_address`, `company_phone`, `company_email`, `company_tpin`, `company_pension_fund`. Drives the payslip header. Plus a **Departments** editor (add/remove, saved as `company.departments` JSON with the tab's batch save) that feeds the employee form's department list. |
| **PAYROLL** | `working_hours_per_day`, `working_days_per_month`, `currency`, `decimal_places`. |
| **STATUTORY** | Pension rates, TEVET, fringe benefit tax (with helper text noting the default 30% and Malawi Taxation Act source), overtime multipliers, **PAYE band editor** with a live preview (`bandPreviewTax` — a small local PAYE calc that duplicates the engine's). |
| **SYSTEM** | Free-form app-level settings. |
| **ADVANCED** | Raw `key`/`value` table, with sensitive-value masking (regex over key names). Add/edit/delete modals here. |

**SUPER_ADMIN branch** — a single **Account** card with email, new password,
and current-password fields. Posts to `PATCH /api/auth/account`. A successful
password change clears the cookie and forces a re-login redirect
(`/login?reset=1`).

**State (tenant):** per-tab `FieldDef[]` configuration + a per-tab local
`formData` map. `effectiveFrom` defaults to today.

**Save flow (tenant):** fires N parallel `POST /api/settings` requests — one
per field. If the network blips mid-save, the settings end up
half-updated. See IMPROVEMENTS for a batch endpoint.

**Local icon:** `XCircle` SVG. Replace with `lucide-react`.

### 3.7 `/audit-logs` — `src/app/audit-logs/page.tsx`

**Who sees it:** ADMIN and SUPER_ADMIN (`Permission.READ_AUDIT_LOGS`).
The route is business-scoped for ADMIN (session `businessId` only) and
cross-business for SUPER_ADMIN (optional `?businessId=` filter
narrows the result). Enforced in `MainNav` (the SUPER_ADMIN nav
includes this entry; ADMIN/PAYROLL_OPERATOR/VIEWER do not), and by the
API (`GET /api/audit-logs` returns 403 for any role that does not hold
`READ_AUDIT_LOGS`).

**What it shows:** A filter bar (date range defaulting to the last
30 days, action select, entity-type select, free-text search,
**and — for SUPER_ADMIN only — a business select**) and a
paginated table (50 rows/page, newest first) of audit events with
timestamp, action, entity type, actor email/employee ID, and description.

**Row expansion:** rows with a stored `oldValue`/`newValue` get a chevron;
expanding shows both JSON payloads pretty-printed plus entity ID, IP
address, and business name.

**Export CSV:** client-side export of the current page. Cells go through
the shared CWE-1236 `escapeCsvCell` convention (single-quote prefix for
`=`, `@`, `+`, `-`, tab, CR leads) and RFC-4180 quoting, matching the
reports exporter. UTF-8 BOM prepended for Excel.

**Implementation note:** the page imports its action/entity option lists
and the `AuditLogDto` type from `@/lib/audit-constants` — the type-only
Prisma module — never from `@/lib/audit`, which pulls the Prisma runtime
and must stay server-side.

### 3.8 `/businesses` — `src/app/businesses/page.tsx`

**Who sees it:** SUPER_ADMIN only (`Permission.MANAGE_BUSINESSES`,
which no other role holds). Nav entry appears only for SUPER_ADMIN.

**What it shows:** A paginated table (50/page, newest first) of
businesses with name, status badge, user and employee counts, and created
date. Toolbar has a "New Business" button opening a create modal
(business name + optional initial admin email/password).

**Status filter chips** (`ACTIVE` / `INACTIVE` / `ALL`, default `ACTIVE`)
above the table wire to `?status=` on `GET /api/businesses`.

**Actions per row:**
- **Name click** — opens a side drawer for that business; the drawer
  lists the business's admins (`GET /api/admin/businesses/[id]/admins`)
  and offers Add / Edit / Deactivate admin actions.
- **Rename / re-activate** — inline modal, `PUT /api/businesses/[id]`
  with `name` and `status`. Deactivating cuts every active session of
  the business's users immediately (verified by
  `business-management.test.ts`); users themselves stay `ACTIVE` so
  re-activating the business restores access without per-user churn.
- **Deactivate** (row-level, ACTIVE only) — confirm dialog →
  `PUT /api/businesses/[id]` with `status: INACTIVE`. Disabled for
  already-INACTIVE businesses; reactivation happens through the rename
  modal.

**Auto-open drawer**: navigating to `/businesses?drawer=<id>` (e.g.
from a recent-businesses link on `/home`) auto-opens the drawer for
that business.

**Backend:** `GET/POST /api/businesses` and `GET/PUT /api/businesses/[id]`
(see API.md §8). These routes are metadata/lifecycle only — SUPER_ADMIN
still cannot read any business's payroll data (no implicit cross-business
access; asserted by test).

### 3.9 `/login` and `/forgot-password` — `src/app/login/page.tsx`, `src/app/forgot-password/page.tsx`

**What they show:** the credential forms. `/login` has email, **business
name**, and password fields; `/forgot-password` has email plus the same
optional business name field. The business name disambiguates accounts when
one email exists in several businesses (email is unique per business, not
globally — see `DATABASE.md`). Hint text under the field reads
*"Super admins leave this blank"*: `SUPER_ADMIN` (`businessId = null`)
authenticates on email + password alone and any supplied business name is
ignored server-side.

**Behaviour:** `/login` POSTs `{ email, password, businessName? }` to
`/api/auth/login`. A `400 { code: 'BUSINESS_REQUIRED' }` (email + password
match several accounts) is rendered as a field error on the business-name
input; all other failures use the generic banner (no enumeration). On
success the page stores `selectedBusinessName` in `sessionStorage` and
routes `SUPER_ADMIN → /home`, everyone else → `/dashboard`.

### 3.10 `/home` — `src/app/home/page.tsx`

**Who sees it:** SUPER_ADMIN only — the root `/` redirects SUPER_ADMIN
here on login (server-side, see `src/app/page.tsx`).

**What it shows:** A focused platform dashboard with three KPI cards
(businesses, admins, payroll records) and a recent-businesses list.
The KPI counts and the last-5 businesses come from
`GET /api/admin/stats` (SUPER_ADMIN-only; uses the same `MANAGE_BUSINESSES`
permission as `/api/businesses`).

**Recent businesses** rows link to `/businesses?drawer=<id>`, which
auto-opens the admin drawer on the businesses page.

**Backend:** `GET /api/admin/stats` (new) — `MANAGE_BUSINESSES`-gated;
ADMIN gets 403.

---

## 4. State Management Cheat-Sheet

| Pattern | Where |
| --- | --- |
| `useState` for form fields | Every form. |
| `useState` for fetched data | Every page. |
| `useEffect` to fire fetches | Every page. |
| URL search params for view state | None yet — see IMPROVEMENTS. |
| Global store (Zustand / Redux / Context) | **None** — the DB is the source of truth. |

---

## 5. Common UX Patterns

| Pattern | Implementation |
| --- | --- |
| **Toast** | The settings page uses a small inline status pill at the top. Other pages use `alert()` — see IMPROVEMENTS to standardize on toasts. |
| **Confirm dialog** | A custom modal with cancel/confirm buttons. Used for delete. |
| **Loading spinner** | `Loader2` from `lucide-react` with `animate-spin`. |
| **Empty state** | Centered icon + message in most lists. |
| **Pagination** | Page / total / limit displayed under every table; prev/next buttons. |
| **Filter strip** | Above every table: search input + 1–2 `<select>` filters. |

---

## 6. Accessibility Notes

- `aria-label` on the sidebar and bottom nav.
- `aria-current="page"` on the active nav link.
- Icons are `aria-hidden="true"`.
- `autoFocus` on the first input of modals.

**Gaps** (see IMPROVEMENTS):
- No skip-link.
- Modal focus trap is incomplete (no `Tab`-cycle logic).
- No `role="alert"` live regions for toasts.
- Charts have no textual alternative.

---

## 7. What Belongs Where (Rules of Thumb)

- **A page is for routing and layout.** It does *not* contain
  business logic. Tax math, validation, or aggregation must live
  in the engine or the API route.
- **A component is for reuse.** If a piece of UI is used in only one
  place, prefer keeping it in the page until a second use case
  appears. The current code is mostly compliant; the main exception
  is the period picker, which is duplicated 4× (see IMPROVEMENTS).
- **An API route is the *only* place that touches the DB.** Pages
  never import `@/lib/prisma`.
- **The engine never imports anything from `next`, `react`, or
  `@prisma/client`.** It is pure TypeScript.
