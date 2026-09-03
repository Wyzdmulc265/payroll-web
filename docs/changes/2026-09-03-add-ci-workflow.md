# Add CI workflow

**Type:** infrastructure
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#33`

## 1. Why

No CI pipeline existed. Every PR and push to `main` was untested
until a human ran `npm run lint && npm test && npm run build`
manually.

## 2. What changed

- Added `.github/workflows/ci.yml` with three jobs:
  - `lint-and-typecheck` — runs `eslint` and `tsc --noEmit`.
  - `test` — runs `vitest`.
  - `build` — runs `next build`.

## 3. How it works

The workflow triggers on `push` and `pull_request` to `main`. Each
job runs on `ubuntu-latest` with Node 20.

## 4. What got better

| Before | After |
|--------|-------|
| No automated quality gate. | Every PR is linted, typed, tested, and built. |

## 5. Risks and trade-offs

- `npm test` requires `DATABASE_URL`. The workflow will fail until
  a secret is configured or tests are decoupled from the DB.

## 6. Test plan

- Push a commit with an intentional lint error → verify the workflow
  fails at `lint-and-typecheck`.

## 7. Follow-ups

- Add `DATABASE_URL` as a GitHub secret for the test job.
- Decouple unit tests from the DB so they run in CI without a
  database.
