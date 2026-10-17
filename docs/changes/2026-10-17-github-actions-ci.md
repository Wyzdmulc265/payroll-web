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
- Pull requests use the isolated PostgreSQL service for tests. Trusted pushes to `main` and manual runs on `main` may use the `DATABASE_URL_TEST` Actions secret instead.

## 3. How it works

- `.github/workflows/ci.yml` defines the workflow jobs, PostgreSQL service, least-privilege permissions, and per-branch concurrency.
- Pull-request code never receives the Neon credential; its database-backed tests use a disposable PostgreSQL service.
- Trusted `main` runs use `DATABASE_URL_TEST` when configured and otherwise fall back to the disposable service. The shared test job is serialized because integration tests perform destructive cleanup.

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

- Use only a dedicated, disposable Neon test database for the `DATABASE_URL_TEST` Actions secret; never configure production data there.
- Resolve the npm audit findings and verify the complete pipeline.