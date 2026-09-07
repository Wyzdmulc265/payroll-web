# Testing Guide

This document covers how to run, write, and maintain tests for WizTech Payroll Web.

---

## 1. Test Suites

| Suite | Location | What it covers |
| --- | --- | --- |
| **Engine tests** | `src/lib/payroll-engine.test.ts` | Pure math: PAYE bands, pension, TEVET, overtime, `buildStatutoryConfigFromSettings`, `selectEffectiveSettings`, `Number()` coercion guards. |
| **FBT tests** | `src/lib/fbt-engine.test.ts` | Fringe Benefits Tax: classification, valuation rules (motor vehicle, housing, school fees, loans, etc.), `calculateEmployerFBT`. |
| **Auth integration tests** | `src/lib/auth/__tests__/` | Login, logout, rate limiting, password reset, tenant isolation, user management, business management, route protection, session cookies. |
| **API integration tests** | `src/app/api/*/__tests__/` | Individual route handlers: employees, payroll, payslips, reports, settings, audit logs, admin stats, admin business management. |
| **Unit tests** | `src/lib/__tests__/` | `encryption.ts` (round-trip, pass-through, wrong-key), `csv.ts` (CWE-1236 escaping), `mail.ts` (transporter config). |

---

## 2. Running Tests

```bash
# All tests (CI mode)
npm run test

# Interactive watch mode
npx vitest watch

# Single file
npx vitest run src/lib/payroll-engine.test.ts

# With coverage
npx vitest run --coverage
```

### Test database

Integration tests require a **separate** PostgreSQL database. Set:

```env
DATABASE_URL_TEST="postgresql://user:password@host/test_database?sslmode=verify-full"
```

The test suite reads `DATABASE_URL_TEST` and refuses to start if it is
unset or points to the same database as `DATABASE_URL`. This is a safety
measure — integration tests perform destructive `deleteMany` cleanup in
`beforeEach`.

### Vitest config

`vitest.config.ts` configures:

- `environment: 'node'`
- `setupFiles: ['./vitest.setup.ts']`
- `pool: 'forks'`, `singleFork: true`
- 30s hook/test timeout (Neon cold-starts are slow)
- `@` alias → `./src`

---

## 3. Writing New Tests

### Engine / FBT tests

```ts
import { describe, it, expect } from 'vitest';
import { calculatePAYE } from '@/lib/payroll-engine';

describe('calculatePAYE', () => {
  it('matches a known boundary', () => {
    expect(calculatePAYE(170000)).toBe(0);
    expect(calculatePAYE(170001)).toBeGreaterThan(0);
  });
});
```

### Integration tests

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getEmployees } from '@/app/api/employees/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

function makeRequest(url: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, { headers });
}

function sessionCookie(token: string): string {
  return `__Host-payroll_session=${token}`;
}

describe('employees route', () => {
  let adminToken: string;

  beforeEach(async () => {
    // Destructive cleanup — only runs against DATABASE_URL_TEST
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();
    await prisma.employee.deleteMany();

    const biz = await prisma.business.create({ data: { name: 'Test Biz' } });
    const hash = await bcrypt.hash('AdminTest123', 10);
    const admin = await prisma.user.create({
      data: { email: 'admin@test.com', passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: biz.id },
    });
    const plain = 'admin-token-' + Date.now();
    await prisma.session.create({
      data: { userId: admin.id, tokenHash: createHash('sha256').update(plain).digest('hex'), expiresAt: new Date(Date.now() + 86400000) },
    });
    adminToken = plain;
  }, 30000);

  it('returns 401 without a session', async () => {
    const res = await getEmployees(makeRequest('http://localhost/api/employees'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid session', async () => {
    const res = await getEmployees(makeRequest('http://localhost/api/employees', sessionCookie(adminToken)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(0);
    expect(json.pagination).toBeDefined();
  });
});
```

### Naming convention

- `*.test.ts` — unit tests
- `*.test.ts` inside `__tests__/` — integration tests
- Test file name matches the module under test: `payroll-engine.test.ts`,
  `auth-flows.test.ts`, `route.test.ts`

---

## 4. Test Database Setup

```bash
# Create test database (run once)
createdb payroll_web_test

# Set env
export DATABASE_URL_TEST="postgresql://localhost:5432/payroll_web_test"

# Run tests
npm run test
```

On Neon, create a separate branch or database for testing. Never point
`DATABASE_URL_TEST` at production.

---

## 5. CI Integration

`.github/workflows/ci.yml` runs:

1. `npm install`
2. `npx prisma generate`
3. `npx prisma migrate deploy` against `DATABASE_URL_TEST`
4. `npm run test`
5. `npm run lint`
6. `npm run build`

Failing any step blocks the PR merge.

---

## 6. Playwright Smoke Tests

`@playwright/test` is installed for browser-level smoke tests. Current
coverage:

- Login flow (valid credentials, invalid password, missing business)
- Payroll run (load period, calculate, save)
- Employee CRUD (create, edit, deactivate)

Run with:

```bash
npx playwright test
```

These are not yet wired into CI; see `IMPROVEMENTS.md` for the track item.
