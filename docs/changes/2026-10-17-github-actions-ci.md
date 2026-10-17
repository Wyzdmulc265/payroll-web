# Add GitHub Actions CI checks

**Type:** feature
**Date:** 2026-10-17
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

The `main` branch had no automated gate for failing tests, lint or TypeScript errors, broken production builds, dependency vulnerabilities, or source-code security findings.

## 2. What changed

- Pull requests and pushes targeting `main` run lint, PostgreSQL-backed tests, TypeScript checks, a production build, and `npm audit`.
- CodeQL scans JavaScript and TypeScript.
- The test job provisions an isolated PostgreSQL service and applies migrations before tests.

## 3. How it works

- `.github/workflows/ci.yml` defines the workflow jobs, PostgreSQL service, least-privilege permissions, and per-branch concurrency.
- Integration tests use the ephemeral `payroll_test` database through `DATABASE_URL_TEST`.
- The workflow requires no application secrets; CI-only encryption configuration is non-production data.

## 4. What got better

- Before: pushes and pull requests had no consistent automated checks.
- After: GitHub reports test, lint, type, build, dependency-audit, and CodeQL results.

## 5. Risks and trade-offs

- Existing dependency findings cause the audit job to fail until the dependency remediation is merged.
- Required checks and branch protection are repository settings and must be configured separately from workflow YAML.

## 6. Test plan

- Parsed the workflow with the repository's existing `js-yaml` package and verified the PostgreSQL test service, TypeScript check, and CodeQL job.
- Verify the complete workflow after it is pushed to GitHub.

## 7. Follow-ups (optional)

- Require the workflow's quality and CodeQL checks on protected `main` and disallow force pushes.
- Resolve the npm audit findings and verify the complete pipeline.