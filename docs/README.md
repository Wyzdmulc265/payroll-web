# WizTech Payroll Web — Documentation

Welcome to the official documentation for the **WizTech Payroll Web** application.
This folder is the canonical reference for understanding, operating, and extending the system.

---

## What is WizTech Payroll Web?

WizTech Payroll Web is a **full-stack payroll management web application** built for
**WizTech Solutions Ltd (Malawi)** to replace an error-prone, Excel/VBA-based payroll
workflow with a modern, auditable, web-based system.

The application implements **Malawi-specific statutory payroll calculations** — including
progressive **PAYE (Pay-As-You-Earn) tax bands**, **pension contributions** (employee
and employer), and the **TEVET (Technical, Entrepreneurial and Vocational Education
and Training) levy** — so that monthly payroll can be calculated, reviewed, saved, and
reproduced exactly for audit and reporting purposes.

---

## Why This App Is Special

WizTech Payroll Web is not a generic "payroll template" — it is purpose-built for
Malawi and the realities of running payroll for a small/medium company. The things
that make it special:

1. **Statutorily Correct, Locally-Aware Calculations**
   - Implements Malawi PAYE 2026 four-band tax (0%, 30%, 35%, 40%) with **cumulative
     tax carried forward across bands** — the only correct way to compute progressive
     tax. The engine auto-discovers band counts and re-derives cumulative tax when
     bands change.
   - TEVET levy is computed as 1% of gross earnings.
   - Pension is split into Employee (5%) and Employer (10%) with a **capped
     pensionable income of 1,000,000 MWK** — the legal ceiling.
   - Overtime is split into three legally-distinct buckets: **normal (1.5×)**,
     **public-holiday (2×)**, and **off-day (2×)** — each calculated against the
     period-specific working-day count, not a flat 22.

2. **Historical Reproducibility**
   - Every `PayrollRecord` stores a **JSON snapshot of the statutory configuration
     used at run-time** (`configSnapshot`). If the rules change tomorrow, payslips
     generated last year still display and recalculate correctly.
   - `Settings.effectiveFrom` allows the same key (e.g. `statutory.pension_ee_rate`)
     to have multiple historical values; the engine selects the row effective at the
     **end of the pay period**, not "today".

3. **Period-Aware Math**
   - Overtime is calculated against the **actual number of working days in the
     pay-period month** (Monday–Friday count), not a hard-coded 22. This matters
     when a pay period crosses a month boundary.

4. **Decimal-Safe Calculations**
   - All money values from Prisma are coerced through `Number()` at the engine
     boundary. Without this guard, `Decimal` values are serialized as **strings** by
     JSON, and a `+` operator silently concatenates them (`"100" + "200" === "100200"`).
     The engine's defensive coercion makes this class of bug impossible.

5. **Zero-Dependency Engine**
   - `src/lib/payroll-engine.ts` is a **pure TypeScript module** with no I/O, no
     framework dependencies, and no global state. It is fully unit-tested (~30
     tests in `payroll-engine.test.ts`) and can be lifted out of Next.js and
     re-used in a CLI, a serverless function, or a separate billing service.

6. **Auditable by Design**
   - Every mutation (employee create/update/deactivate, payroll run, settings
     change) writes an `AuditLog` row with a JSON snapshot of the old and new
     values. This makes it possible to answer *"who changed what, when?"* — a
     requirement in any regulated payroll environment.

7. **Modern, Type-Safe Stack**
   - Next.js 16 (App Router) + React 19 + TypeScript (strict) + Prisma 7 with the
     new driver-adapter pattern + PostgreSQL. Every API route is validated with
     **Zod**, and every money calculation has a tested code path.

---

## High-Level Feature List

| Area | Features |
| --- | --- |
| **Employees** | CRUD with Zod-validated forms, search, paginated list, soft-delete (deactivate), per-employee 12-month payroll history. |
| **Payroll Engine** | Malawi PAYE (4-band progressive), pension (EE/ER, capped), TEVET levy, three-bucket overtime, period-aware working-day count, statutory config loaded from settings, JSON config snapshot persisted to each `PayrollRecord`. |
| **Payroll Runs** | "Calculate → Validate → Save" workflow. Live preview, bulk create in a single transaction, refuses re-runs of a closed period. |
| **Payslips** | Per-employee, per-period payslip view, browser-print-ready (`@media print`), with company info sourced from `Settings`. |
| **Reports** | Payroll Register, Payroll Summary (department roll-up), Statutory Summary, Department Payroll, Bank Payment Schedule, Employee Earnings History. CSV and Excel (`.xls`) export. |
| **Dashboard** | KPIs (active employees, gross/net, PAYE, pension EE/ER, employer cost), department payroll bar chart, 12-month payroll area chart, distribution pie, headcount line chart. |
| **Settings** | Tabbed UI for COMPANY, PAYROLL, STATUTORY (with live PAYE band preview), SYSTEM, ADVANCED. Effective-dated keys; bulk save; per-key audit history. |

---

## Documentation Map

| File | Purpose |
| --- | --- |
| [`README.md`](./README.md) | This file — orientation, features, why it's special. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How the system is wired together: layers, data flow, request lifecycle. |
| [`STACK.md`](./STACK.md) | Every dependency, with its role and *why it was chosen* for this app. |
| [`ENGINE.md`](./ENGINE.md) | Deep dive on `payroll-engine.ts` — types, functions, formulas, and example math. |
| [`API.md`](./API.md) | Every API route: method, path, request, response, validation, side-effects. |
| [`DATABASE.md`](./DATABASE.md) | Prisma schema documentation: every model, field, index, and relation. |
| [`UI.md`](./UI.md) | Pages and components: what each page does, key state, interactions. |
| [`IMPROVEMENTS.md`](./IMPROVEMENTS.md) | Repo audit: things that need fixing, prioritized. |
| [`AI-DOCUMENTATION-INSTRUCTIONS.md`](./AI-DOCUMENTATION-INSTRUCTIONS.md) | The rules an AI must follow when documenting future changes. |
| [`changes/`](./changes) | One Markdown file per code change — *what* changed, *why*, and *what got better*. |
| [`bugsfix/`](./bugsfix) | One Markdown file per bug + its fix — *what* broke, *why*, and *how it was fixed*. |

---

## Quick Start (for Developers)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL to your PostgreSQL connection string.

# 3. Apply migrations and seed
npm run prisma:deploy
npm run prisma:seed

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Run tests
npm run test
```

---

## Glossary

| Term | Meaning |
| --- | --- |
| **PAYE** | Pay-As-You-Earn — Malawi's progressive monthly income tax. |
| **Pension EE / ER** | Employee / Employer pension contribution (5% / 10% respectively, capped at MWK 1,000,000 pensionable income). |
| **TEVET** | Technical, Entrepreneurial and Vocational Education and Training levy (1% of gross). |
| **Pay Period** | A `YYYY-MM` string (e.g. `2026-08`) representing the month for which payroll is being run. |
| **Statutory Config** | The full set of rates, bands, and thresholds used to compute payroll, loaded from `Settings`. |
| **Config Snapshot** | A JSON copy of the Statutory Config frozen at payroll-run time and stored on the `PayrollRecord`. |
| **Effective From** | The date a `Settings` row becomes the source of truth for its key. |
| **Soft Delete** | Marking an `Employee.isActive = false` rather than removing the row, so historical payrolls stay intact. |

---

## Contributing

Read [`IMPROVEMENTS.md`](./IMPROVEMENTS.md) before proposing changes. If you are an AI
agent, read [`AI-DOCUMENTATION-INSTRUCTIONS.md`](./AI-DOCUMENTATION-INSTRUCTIONS.md)
*first* — documentation is part of every change.
