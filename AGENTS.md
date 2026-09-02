<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project documentation

This repository has a full documentation set under `docs/`.
**Read `docs/README.md` first** to orient yourself, then read the
relevant deeper docs before touching code:

- `docs/ARCHITECTURE.md` — system shape and request lifecycle.
- `docs/STACK.md` — every dependency and why it was chosen.
- `docs/ENGINE.md` — the Malawi payroll calculation engine.
- `docs/API.md` — every API route.
- `docs/DATABASE.md` — Prisma schema.
- `docs/UI.md` — pages and components.
- `docs/IMPROVEMENTS.md` — prioritized audit of what to fix.

## AI agents: documentation is mandatory

If you are an AI assistant making any code change, you **must**
also create a single Markdown file describing the change. The
rules and templates are in:

- **`docs/AI-DOCUMENTATION-INSTRUCTIONS.md`** — read this
  before writing any code.
- `docs/changes/<YYYY-MM-DD>-<slug>.md` — one file per
  feature, refactor, dependency bump, or schema migration.
- `docs/bugsfix/<YYYY-MM-DD>-<slug>.md` — one file per bug
  and its fix.

A change without a matching `docs/changes/` or `docs/bugsfix/`
file is **incomplete**. Do not consider your work done until
the docs file is committed alongside the code.
