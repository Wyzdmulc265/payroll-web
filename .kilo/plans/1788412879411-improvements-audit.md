# Audit: unimplemented items in `docs/IMPROVEMENTS.md`

This plan inventories every numbered item in `docs/IMPROVEMENTS.md`,
marks each as **DONE / OPEN / PARTIAL**, and lists the concrete code
gaps that still need to be closed. No implementation here — this is a
planning artefact only.

---

## 1. Verdict matrix

Status key: ✅ done, 🟡 partial, ❌ not done.

| # | Severity | Item | Status | Evidence |
|---|----------|------|--------|----------|
| 1 | critical | Auth/auth wired | ✅ done | `src/lib/auth/`, `src/proxy.ts`, `src/app/login`; `next-auth` removed in `2026-09-03-dependency-cleanup-and-fixes.md` |
| 2 | critical | CSRF / same-origin on mutating routes | ❌ not done | No `Origin`/`Referer` check in `src/proxy.ts` or route handlers |
| 3 | critical | `saveToApi` N parallel POSTs | 🟡 partial | `settings/page.tsx:386` still `Promise.all`s one POST per field; **no `/api/settings/batch` route exists** |
| 4 | critical | DELETE `/api/settings` no audit log | ✅ done | `src/app/api/settings/route.ts:65` writes `SETTINGS_DELETED` |
| 5 | critical | `.env.example` shipped | 🟡 partial | File exists but still references `NEXTAUTH_URL` / `NEXTAUTH_SECRET` (`removed`); no SMTP, no AUTH_SECRET |
| 6 | high | Engine math duplicated in pages | ❌ not done | `payroll/page.tsx:285 calculateOvertimePay` and `settings/page.tsx:170 bandPreviewTax` still inline |
| 7 | high | `getWorkingDaysInMonth` ignores holidays | ❌ not done | `payroll-engine.ts:478` is plain Mon–Fri tally, no holiday table |
| 8 | high | PAYE band gap/overlap not validated | ❌ not done | No `validateTaxBands`; settings UI accepts gaps silently |
| 9 | high | Hardcoded department list in employees modal | 🟡 partial | `fetchDepartments` exists but `fetchEmployees` already extracts departments (line 94); `fetchDepartments` is dead code; `<select>` is partially data-driven (see #22) |
| 10 | high | `/api/payroll` POST race on existingCount | ❌ not done | `route.ts:121` count-then-`createMany`; no `P2002` mapping |
| 11 | high | `pensionApplicable` / `taxStatus` unused | ❌ not done | Engine reads neither field; declared in schema |
| 12 | medium | Pages are all `'use client'` | ❌ not done | All six pages are client components |
| 13 | medium | No SWR / cache layer | ❌ not done | No SWR dep; each page re-fetches independently |
| 14 | medium | `useEffect` + `setLoading` lint disables | ❌ not done | Still present in `reports/page.tsx:74` |
| 15 | medium | CSV export formula injection | 🟡 partial | Fixed for **audit-logs** (`add-audit-log-viewer.md`); **NOT fixed in `reports/page.tsx:118 exportToCSV`** — only `"` is escaped |
| 16 | medium | "Export PDF" is `window.print()` | ❌ not done | Still `window.print()` in `payslips/page.tsx` |
| 17 | medium | Repeated `<EmployeeForm>` | ❌ not done | Modal is ~200 lines inline in `employees/page.tsx` |
| 18 | medium | Repeated types | ❌ not done | `Employee`, `Setting`, `PayrollRow` re-declared per page |
| 19 | medium | Repeated period picker | ❌ not done | 4 copies across pages |
| 20 | medium | Local SVG icons | 🟡 partial | Most pages use `lucide-react`; spot-check remaining locals |
| 21 | medium | `employeeSchema` / `updateEmployeeSchema` duplication | ❌ not done | `src/app/api/employees/route.ts` has both inline |
| 22 | medium | Dead `fetchDepartments` | ❌ not done | Still present (`employees/page.tsx:105`) |
| 23 | medium | `EmployeeEarningsHistory` report contract | ❌ not done | Query string `department` vs `employeeId` not aligned |
| 24 | medium | `Settings` upsert clobbers history | ✅ done | `key` is now `@@unique([key, businessId])` (composite key + per-business scope; confirmed in phase-12 doc) |
| 25 | medium | Inconsistent error envelopes / `alert()` | ❌ not done | `alert(...)` still used in `employees`, `payroll`, `payslips`, `reports` |
| 26 | medium | No API / React tests | 🟡 partial | Engine + auth + business-management tests exist; **no tests for `/api/employees`, `/api/payroll`, `/api/settings`, `/api/reports`** |
| 27 | medium | Audit log `oldValue`/`newValue` text JSON | ❌ not done | Still `String` columns |
| 28 | medium | Duplicate migration name | ❌ not done | Both `20260901054845_` and `20260901055119_` named `payroll_config_snapshot` |
| 29 | medium | `@types/node` ^20 with Next 16 | ❌ not done | (Not verified — assumed) |
| 30 | medium | No rate limiting on `/api/payroll/calculate` | ❌ not done | `src/app/api/payroll/calculate/route.ts` is unguarded |
| 31 | low | `@react-pdf/renderer` removed | ✅ done | Removed in dependency-cleanup PR |
| 32 | low | `next-auth` removed | ✅ done | Removed in dependency-cleanup PR |
| 33 | low | No CI config | ❌ not done | No `.github/workflows/*.yml` |
| 34 | low | `getWorkingDaysInMonth` TZ-naive | ❌ not done | Uses `new Date(y, m-1, d)` (local) |
| 35 | low | A11y audit | ❌ not done | No skip-link, no axe run |
| 36 | low | Reports labels hardcode `MWK` | ❌ not done | "Bank Payment Schedule (MWK)" etc. are literal strings |
| 37 | low | No i18n framework | ❌ not done | Acceptable; flagged only |
| 38 | low | Tailwind v4 `@theme` colors not consumed | ❌ not done | `#1e40af` hardcoded in dashboard `COLORS` |
| 39 | low | `formatCompact` ignores configured currency | ❌ not done | `dashboard/page.tsx` hardcodes `MWK` |
| 40 | low | `Employee.formData.basicSalary` is `string` | 🟡 partial | Zod uses `z.coerce.number()` in some places; verify per route |
| 41 | low | Payroll totals `<td colSpan={3}>` | ❌ not done | Not audited |
| 42 | low | Engine/page type divergence | ❌ not done | `PayrollResult` vs page-side wider type |
| 43 | low | No `vitest.config.ts` | ✅ done | `vitest.config.ts` exists at repo root |
| 44 | low | Seed script `dotenv/config` redundancy | ❌ not done | Likely still present in `prisma/seed.ts` |
| 45 | low | "Generate Payslips" stub | ❌ not done | Still a stub in `payroll/page.tsx` |

---

## 2. Items still open after today's `docs/changes/` review

The latest `docs/changes/` entries close out auth (#1), audit
completeness (#4, plus new `/audit-logs` viewer), business management,
and dependency cleanup. Everything else is open.

**Highest-impact open items** (each maps to a single change doc):

1. **#2 — CSRF / same-origin guard.** Add a same-origin check to
   `src/proxy.ts` (compare `Origin`/`Referer` to `req.nextUrl.host` for
   mutating methods). ~30 LOC.
2. **#3 — Settings batch endpoint.** New `src/app/api/settings/batch/route.ts`
   accepting `z.array(settingSchema).min(1)`, wrapping in
   `prisma.$transaction`. Replace `saveToApi`'s `Promise.all` with one
   call. Single `AuditLog` row per batch.
3. **#5 — Refresh `.env.example`.** Drop `NEXTAUTH_*`; add
   `AUTH_SECRET`, `SESSION_COOKIE_NAME`, `SMTP_HOST/PORT/USER/PASS`,
   `NEXT_PUBLIC_APP_URL`. Update README pointer.
4. **#6 — Engine dedup.** Expose `previewOvertimePay(overtimeHours, holidayHours, weekendHours, basicSalary, config)`
   and `previewPAYE(income, bands)` from `src/lib/payroll-engine.ts`;
   delete the local copies in `payroll/page.tsx:285` and
   `settings/page.tsx:170`; add tests to `payroll-engine.test.ts`.
5. **#7 — Public holidays.** Add `src/lib/malawi-holidays.ts` keyed by
   `YYYY-MM-DD` (2024–2027 minimum); subtract from
   `getWorkingDaysInMonth`. Document in `ENGINE.md`.
6. **#8 — Tax-band validation.** Add `validateTaxBands(bands): string | null`
   in the engine; call it from `buildStatutoryConfigFromSettings` and
   from `POST /api/settings` for statutory category; surface a 400 on
   failure.
7. **#10 — Payroll race.** Wrap `createMany` in try/catch; map `P2002`
   to `400 { error: 'Payroll already exists for period …' }`.
8. **##11 — Wire `pensionApplicable` / `taxStatus`.** Engine reads
   `employee.pensionApplicable` (skip both halves if false) and
   `employee.taxStatus === 'Exempt' → paye = 0`. Document in `ENGINE.md`.
9. **#15 — CSV injection in reports.** Move `escapeCsvCell` from
   `audit-logs/page.tsx` into `src/lib/csv.ts`; reuse from
   `reports/page.tsx:118 exportToCSV` and `exportToExcel` (HTML cells).
   Add `__tests__/reports.csv.test.ts`.
10. **#22, #9 — Employees department cleanup.** Delete dead
    `fetchDepartments`; switch the Add/Edit modal's department `<select>`
    to use the `fetchEmployees` extract.
11. **#25 — Toast / `useApi` helper.** Extract `useApi` returning
    `{ data, error, isLoading }`; replace `alert(...)` everywhere except
    destructive-action confirms.
12. **#30 — Rate limit `/api/payroll/calculate`.** Reuse the
    DB-backed `RateLimit` table (already used for `/api/auth/login`).
13. **#33 — CI workflow.** `.github/workflows/ci.yml` running
    `npm run lint`, `npm run test`, `npm run build`.
14. **#28 — Rename duplicate migration.** Squash or rename
    `20260901055119_payroll_config_snapshot` to
    `20260901055119_payroll_config_snapshot_extend`.

Lower-impact but still open: #12, #13, #14, #16, #17, #18, #19, #20,
#21, #23, #26 (additional tests), #27 (Json columns), #29, #34, #35,
#36, #38, #39, #40, #41, #42, #44, #45.

---

## 3. Plan-of-attack (proposed order)

Single-doc-per-item discipline (mandated by `AGENTS.md`). Each step
below is one new `docs/changes/<date>-<slug>.md`.

1. `add-csrf-origin-guard` — #2.
2. `add-settings-batch-endpoint` — #3 (mirrors the template already in
   `docs/changes/0000-01-01-example-add-settings-batch-endpoint.md`).
3. `refresh-env-example` — #5.
4. `move-engine-math-into-pure-functions` — #6.
5. `add-malawi-public-holidays` — #7.
6. `validate-tax-bands` — #8.
7. `fix-payroll-create-race` — #10.
8. `wire-pension-applicable-and-tax-status` — #11.
9. `fix-csv-injection-in-reports` — #15.
10. `employees-cleanup-dead-fetchDepartments` — #22, #9.
11. `extract-useapi-and-toast-helper` — #25.
12. `rate-limit-payroll-calculate` — #30.
13. `add-ci-workflow` — #33.
14. `rename-duplicate-migration` — #28.

Each entry should keep its single PR ≤ 300 LOC diff (excluding tests
and docs).

---

## 4. Validation

- `npm run lint` and `tsc --noEmit` after each step.
- `npm test` — extend `payroll-engine.test.ts` for #6, #7, #8, #11;
  add `__tests__/api/settings.batch.test.ts` for #3; add
  `__tests__/reports.csv.test.ts` for #15; add `__tests__/api/payroll.race.test.ts`
  for #10.
- Manual: open `/settings`, change 5 fields, kill mid-save, refresh
  → either all 5 saved or none (verifies #3).
- Manual: open a CSV export from `/reports` in Excel with a setting
  starting with `=cmd|...` → text only (verifies #15).

---

## 5. Out of scope (explicit)

- Items already marked ✅ in §1.
- Architectural rewrites that contradict Phase 12 decisions
  (e.g. cross-business audit viewer for SUPER_ADMIN — deferred).
- i18n framework (#37) — acceptable single-language tool.
- Migration to Prisma 6 to clear remaining `mysql2` vulnerability
  (tracked separately in `2026-09-03-dependency-cleanup-and-fixes.md`
  follow-ups).