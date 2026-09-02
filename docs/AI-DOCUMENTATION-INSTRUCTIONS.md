# AI Documentation Instructions

> **Audience:** any AI assistant (Kilo, Claude, GPT, Copilot, Cursor,
> Devin, etc.) that is asked to change code in this repository.
>
> **Purpose:** make documentation a *mandatory, structured* part of
> every change. If you modify code, you **must** create a single
> Markdown file in the appropriate `docs/` subfolder that explains
> *what* you changed, *why*, and *what got better*.

These rules apply to **all changes** — features, refactors,
performance work, dependency updates, schema migrations, and bug
fixes. They exist so that:

1. A human reviewer can understand the *intent* of every change
   without re-reading the diff.
2. The next contributor (human or AI) has context for the
   decisions that shaped the codebase.
3. The audit story of *why the app is the way it is* survives even
   if individual contributors leave.

---

## 1. The Two Folders

```
docs/
├── changes/     ← one file per code change (feature, refactor, perf, dep, schema)
└── bugsfix/     ← one file per bug + its fix (user-reported, repro, root cause, fix)
```

- **`docs/changes/`** — for **proactive** work: anything that
  improves the codebase but isn't a specific user-reported bug.
  Examples: "Add a `POST /api/settings/batch` endpoint", "Extract
  `<PeriodPicker />`", "Bump Next.js to 16.3.5", "Wire up
  `next-auth`".

- **`docs/bugsfix/`** — for **reactive** work: a user (or a test,
  or a monitoring alert) reported that something is broken, and
  you fixed it. The file must include the **repro**, the
  **root cause**, and the **fix**.

If a fix *also* constitutes a feature change, write **both**: a
`bugsfix/` file for the bug aspect and a `changes/` file for the
broader improvement.

---

## 2. File Naming

Use a stable, sortable, kebab-case name. The recommended pattern is:

```
YYYY-MM-DD-<short-slug>.md
```

- `YYYY-MM-DD` — the date the change was merged.
- `<short-slug>` — a kebab-case summary, 2–6 words.

Examples:

```
docs/changes/2026-09-01-extract-period-picker.md
docs/changes/2026-09-15-add-settings-batch-endpoint.md
docs/changes/2026-10-01-wire-up-next-auth.md

docs/bugsfix/2026-09-02-csv-injection-in-reports-exporter.md
docs/bugsfix/2026-09-10-payroll-run-race-condition.md
docs/bugsfix/2026-09-22-department-select-rejects-custom-value.md
```

If the date is not yet known, use the planned merge date or omit
it (and add it later). Never use spaces or uppercase in the
filename.

---

## 3. Required Template — `docs/changes/`

Every change file **must** contain these sections, in this order.
If a section does not apply, write "N/A" with a one-line reason —
do not omit it.

```markdown
# <Short title of the change>

**Type:** feature | refactor | performance | dependency | schema | docs
**Date:** YYYY-MM-DD
**Author(s):** <name, handle, or "AI assistant">
**Related issue/PR:** <link or "none">

---

## 1. Why

What problem were we trying to solve, or what opportunity were we
taking? Frame it in terms of a user-facing pain point, a developer
pain point, a security risk, or a quality bar. Reference the
relevant entry in `docs/IMPROVEMENTS.md` if applicable.

## 2. What changed

Bullet list of the user- or developer-visible change(s). One
bullet per change, written from the *consumer's* point of view.

## 3. How it works

A short technical description: which files were added, modified,
or deleted; which functions were added or moved; which tests
were added. Include a small code snippet if the change is non-
obvious.

## 4. What got better

Concrete, measurable (or at least observable) outcomes. Use the
"Before / After" format when possible. Tie back to the qualities
listed in `docs/README.md#why-this-app-is-special`:

- Is the app more statutorily correct?
- Is it more historically reproducible?
- Is it more decimal-safe?
- Is the engine more isolated / testable?
- Is it more auditable?
- Is it more type-safe?

## 5. Risks and trade-offs

Anything the reviewer should know that is *not* obvious from the
diff. Performance regressions, breaking API changes, new
dependencies, schema migrations, follow-up work.

## 6. Test plan

How was this change verified? Unit tests, manual test steps,
type-check, lint, build, smoke test on the dev server.

## 7. Follow-ups (optional)

Bullet list of related work that this change enables or
suggests. Cross-reference `docs/IMPROVEMENTS.md` entries.
```

---

## 4. Required Template — `docs/bugsfix/`

Every bug-fix file **must** contain these sections, in this order.

```markdown
# <Short title: "Bug: <symptom>" or "<Symptom> — <root cause>">

**Severity:** critical | high | medium | low
**Date discovered:** YYYY-MM-DD
**Date fixed:** YYYY-MM-DD
**Reporter:** <name, handle, or "internal">
**Related issue/PR:** <link or "none">

---

## 1. Symptom

What the user (or test, or alert) saw. Describe the visible
behaviour, not the cause.

## 2. Reproduction

The minimal steps, inputs, or environment required to trigger
the bug. Include a code snippet, a request payload, or a screen
recording reference. If the bug is non-deterministic, describe
the conditions under which it occurs.

## 3. Impact

Who was affected, how often, and how severely. Ties to the
audit story when relevant (e.g. "incorrect net pay on a
specific period").

## 4. Root cause

The actual technical reason. Cite file paths and line numbers.
Distinguish *triggering* from *root* cause where relevant.

## 5. Fix

The change that resolves the bug. Include a short diff or
before/after snippet. If the fix is in a new function or
endpoint, point to its doc page.

## 6. Verification

How the fix was proven to work. The new test that fails on
the old code and passes on the new code; the manual repro
that no longer triggers the bug.

## 7. Prevention

What *systemic* change would prevent this class of bug from
recurring? A new test, a new invariant, a new lint rule, a
schema change, a new dependency, etc. If no systemic fix is
planned, say so explicitly and explain why.
```

---

## 5. Quality Rules

These rules apply to *both* folders.

### 5.1 One file per change
If a PR covers two logically separate improvements, write two
files. If a PR covers one improvement and a one-line drive-by
fix, write one file and mention the drive-by in the "What
changed" section.

### 5.2 No duplicates
Before creating a file, search the folder for related work. If a
prior change is closely related, link to it from the new file
and explain the delta. Do not create a new file that just
restates an existing one.

### 5.3 Specific over general
"Do not use `any`" is not a useful change description. "Replace
`as any` casts in `src/lib/payroll-engine.ts` with `StatutoryConfig`
typing so the engine cannot be called with a malformed config"
*is* useful.

### 5.4 Numbers when you can
"We improved performance" is weak. "The dashboard's
`/api/dashboard?period=…` request time fell from 480 ms to 95 ms
(p50) after replacing the N+1 in `byDepartment` with a single
`groupBy`" is strong.

### 5.5 Update other docs when relevant
If you change the schema, update `docs/DATABASE.md`. If you
change an API route, update `docs/API.md`. If you add a function
to the engine, update `docs/ENGINE.md`. A change file is a
*commitment* that the rest of the documentation is in sync.

### 5.6 Cross-link
Every change file should link to:

- The `docs/IMPROVEMENTS.md` entry it addresses (if applicable).
- Any `docs/changes/` or `docs/bugsfix/` files it builds on or
  supersedes.

Use relative links (`./IMPROVEMENTS.md#1`).

### 5.7 No secrets, no PII
Do not include real employee data, real payroll figures, real
secrets, or any information that should not be in the repo. Use
fictional example data (`EMP001`, `1,650,000 MWK`) instead.

### 5.8 Plain Markdown
- Use `#`/`##`/`###` headings.
- Use fenced code blocks with the appropriate language tag
  (`ts`, `tsx`, `prisma`, `json`, `bash`).
- Use tables for structured data.
- Use relative links for internal navigation.
- Do not embed images unless the visual is essential (and
  then reference the file in `docs/assets/`).

---

## 6. Commit Hygiene

When committing a change, include the new docs file in the
**same commit** as the code change. Example:

```bash
git add src/app/api/settings/route.ts \
        src/app/settings/page.tsx \
        docs/changes/2026-09-15-add-settings-batch-endpoint.md

git commit -m "feat(settings): add batch endpoint for atomic saves

Adds POST /api/settings/batch and updates the settings page to
use it instead of N parallel POSTs. Closes #142.

Docs: docs/changes/2026-09-15-add-settings-batch-endpoint.md"
```

If a single commit covers multiple docs files (one feature + one
bug, or a feature spanning several improvements), group them
intentionally and mention each in the commit body.

---

## 7. Examples (templates you can copy)

### 7.1 `docs/changes/<date>-<slug>.md`

```markdown
# Add `POST /api/settings/batch` endpoint for atomic saves

**Type:** feature
**Date:** 2026-09-15
**Author(s):** AI assistant
**Related issue/PR:** #142

## 1. Why

The settings page issues one `POST /api/settings` per field in
parallel. A network blip mid-save leaves the `Settings` table
half-updated, with no rollback. See `docs/IMPROVEMENTS.md#3`.

## 2. What changed

- A new `POST /api/settings/batch` endpoint accepts an array of
  upserts and writes them in a single transaction.
- The settings page now issues a single batch request on save
  instead of N parallel requests.
- An `AuditLog` row is written once per batch with the full
  before/after map.

## 3. How it works

- New route: `src/app/api/settings/batch/route.ts`.
- Schema in the route: `z.array(settingSchema).min(1)`.
- The handler wraps `prisma.$transaction(rows.map(...))` in a
  try/catch and emits a single `AuditLog`.

```ts
await prisma.$transaction(
  rows.map(r => prisma.settings.upsert({ where: { key: r.key }, ... }))
);
await prisma.auditLog.create({ data: { action: 'BATCH_UPDATE', ... } });
```

## 4. What got better

- **Atomicity**: settings are now all-or-nothing. The half-saved
  state is no longer reachable.
- **Auditable**: a single `BATCH_UPDATE` audit row replaces N
  individual ones; easier to read.
- **Performance**: 1 round-trip instead of N, removing the
  thundering-herd risk on slow networks.

## 5. Risks and trade-offs

- The new endpoint is additive; the old `POST /api/settings`
  remains for backward compatibility.
- Any client still using N parallel POSTs should migrate; the
  next deprecation cycle will remove it.

## 6. Test plan

- Manual: open settings, change 5 fields, save. Refresh the
  page; all 5 changes are visible. Pull the network cable
  mid-save and verify no partial state.
- Unit: `__tests__/api/settings.batch.test.ts` covers the happy
  path, an empty array (400), and a transaction rollback
  scenario.

## 7. Follow-ups

- Migrate the settings page to use the new endpoint (done in
  this PR).
- Deprecate `POST /api/settings` once all clients migrate.
- Add an integration test for the full settings-save flow.
```

### 7.2 `docs/bugsfix/<date>-<slug>.md`

```markdown
# Bug: Settings save can leave `Settings` table in a half-updated state

**Severity:** high
**Date discovered:** 2026-09-10
**Date fixed:** 2026-09-15
**Reporter:** internal
**Related issue/PR:** #142

## 1. Symptom

After saving a multi-field change on the Settings page, a
random subset of the changes is persisted. The other fields
revert to their prior values on the next page load.

## 2. Reproduction

1. Open `/settings`.
2. Modify 3 fields (e.g. pension EE rate, TEVET rate, and
   company address).
3. Click "Save".
4. Throttle the network to "Slow 3G" in DevTools so each
   individual `POST /api/settings` takes > 1 s.
5. Refresh the page; some changes are missing.

## 3. Impact

- **High** for a payroll system: silently inconsistent statutory
  config leads to silently inconsistent payslips.
- The audit log records 3 individual `UPDATE` events rather
  than one batch, masking the fact that the change was meant
  to be atomic.

## 4. Root cause

`src/app/settings/page.tsx` issues N parallel
`fetch('/api/settings', { method: 'POST' })` calls. Each is its
own transaction. The page does not retry on failure and does
not display partial-success state.

## 5. Fix

- Added `POST /api/settings/batch` (see
  `docs/changes/2026-09-15-add-settings-batch-endpoint.md`).
- Updated `src/app/settings/page.tsx` to issue a single batch
  request.
- Single `AuditLog` row is now written per save.

## 6. Verification

- Manual repro on "Slow 3G" no longer triggers partial saves.
- New test `__tests__/api/settings.batch.test.ts` covers the
  transaction-rollback path: a forced failure in the middle of
  the batch leaves no rows updated.

## 7. Prevention

- Add an ESLint rule (or a code review checklist item) that
  flags any client code issuing > 1 mutation request in
  parallel without a "batch" wrapper.
- Add a `Batch` Zod schema convention so that "all settings
  changes go through `/api/settings/batch`" is enforceable.
- Document the new contract in `docs/API.md` and link it from
  the settings page header.
```

---

## 8. AI-Specific Rules

If you are an **AI assistant** generating one of these files, you
**must** additionally:

1. **Search the existing `docs/`** before writing. If a related
   file already exists, link to it and explain the delta. Do not
   duplicate.
2. **Match the tone** of the existing docs (clear, technical,
   direct, no marketing language).
3. **Cite file paths and line numbers** in the technical
   sections. Vague claims are not acceptable.
4. **Do not invent metrics.** If you don't have a number, write
   "qualitative" or "to be measured post-deploy".
5. **Prefer diagrams (mermaid) over prose** when explaining a
   flow. Example:

   ````markdown
   ```mermaid
   sequenceDiagram
     participant U as User
     participant P as /payroll page
     participant A as /api/payroll
     U->>P: Click "Save"
     P->>A: POST { payrollPeriod, overtimeData }
     A-->>P: 200 { success: true, processedCount: 47 }
     ```
   ````

6. **Update the relevant `docs/*.md` files** when your change
   affects them (see §5.5). If you don't, a reviewer will send
   the change back.
7. **Stop and ask the user** if the change is ambiguous. A
   speculative doc is worse than no doc.
8. **Do not** create docs for changes you are about to revert.
   If your work-in-progress is being discarded, the docs go with
   it.

---

## 9. Quick Reference

| You are… | Write a file in… | Use template §… |
| --- | --- | --- |
| Adding a new feature | `docs/changes/` | §3 |
| Refactoring code | `docs/changes/` | §3 |
| Bumping a dependency | `docs/changes/` | §3 |
| Adding a Prisma migration | `docs/changes/` | §3 |
| Fixing a reported bug | `docs/bugsfix/` | §4 |
| Patching a security issue | `docs/bugsfix/` | §4 |
| Fixing a flaky test | `docs/bugsfix/` | §4 |

If unsure, default to `docs/changes/` and link from
`docs/IMPROVEMENTS.md`.
