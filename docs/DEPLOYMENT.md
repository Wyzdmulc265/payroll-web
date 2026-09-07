# Deployment Guide

This document covers deploying WizTech Payroll Web to production.

---

## 1. Prerequisites

- **Node.js 20+** (matches Next 16 requirement)
- **PostgreSQL 15+** (Neon or self-hosted)
- **SMTP relay** (Brevo recommended; see `MAILER-PROMPT.md`)
- **Vercel** (or any Next.js-compatible host)

---

## 2. Environment Variables

Copy `.env.example` to `.env` and set the following for production:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string (use Neon pooler for serverless). |
| `DATABASE_URL_TEST` | Yes | Isolated test database. Must be separate from `DATABASE_URL`. |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for PII field-level encryption. Generate with `openssl rand -hex 32`. **Production MUST set this** — existing plaintext PII must be re-encrypted after enabling. |
| `SESSION_DURATION_DAYS` | No | Session lifetime in days (default: `1`). |
| `SMTP_HOST` | Yes | Brevo SMTP host (`smtp-relay.brevo.com`). |
| `SMTP_PORT` | Yes | Brevo SMTP port (`587`). |
| `SMTP_USER` | Yes | Brevo SMTP login. |
| `SMTP_PASS` | Yes | Brevo SMTP key. |
| `SMTP_FROM` | Yes | Verified sender email (e.g. `Payroll System <no-reply@yourdomain.com>`). |
| `NEXT_PUBLIC_APP_URL` | Yes | Full production URL (e.g. `https://payroll.yourdomain.com`). |

### Security notes

- `ENCRYPTION_KEY` must be 32 bytes (64 hex chars). Store it in your
  secret manager, not in `.env` on disk.
- `SESSION_COOKIE_NAME` is `__Host-payroll_session` — requires `Secure`
  cookies. Ensure your production host uses HTTPS.
- Never commit real secrets to Git. Use Vercel Environment Variables,
  Azure Key Vault, or your CI's secret store.

---

## 3. Database Migrations

Migrations are checked into `prisma/migrations/`. Apply them in production
with:

```bash
npm run prisma:deploy
```

This runs `prisma migrate deploy` against `DATABASE_URL`. It is safe to
run multiple times; Prisma tracks which migrations have already been applied.

### Seed data

After the first deploy, load reference data (PAYE bands, default settings):

```bash
npm run prisma:seed
```

Seed is idempotent for most rows (uses `createMany` with ignores), but
check `prisma/seed.ts` before re-seeding.

---

## 4. Build and Deploy

### Vercel

1. Import the repository in Vercel.
2. Set all environment variables in Project Settings → Environment Variables.
3. Ensure `DATABASE_URL` uses the **pooled** connection string (Neon
   `-pooler.sa-east-1.aws.neon.tech` or equivalent).
4. Vercel runs `npm install` → `npm run build` automatically.
5. After the first successful build, run migrations:
   ```bash
   vercel env pull .env.production
   npx prisma migrate deploy
   npx prisma db seed
   ```

### Docker / Self-hosted

```bash
docker build -t payroll-web .
docker run -p 3000:3000 --env-file .env.production payroll-web
```

---

## 5. Pre-Deployment Checklist

- [ ] `DATABASE_URL` points to the production database.
- [ ] `DATABASE_URL_TEST` points to a **separate** test database.
- [ ] `ENCRYPTION_KEY` is set (32-byte hex).
- [ ] `SMTP_*` variables are configured and tested.
- [ ] `NEXT_PUBLIC_APP_URL` is the production URL.
- [ ] `npm run build` passes locally.
- [ ] `npm run test` passes against `DATABASE_URL_TEST`.
- [ ] Migrations are up to date: `npx prisma migrate deploy` runs clean.
- [ ] Vercel `serverExternalPackages: ['@prisma/client']` is set in
  `next.config.ts` (already configured).
- [ ] `Cache-Control: no-store` and `Content-Security-Policy` headers are
  present in the production response.

---

## 6. Post-Deployment Verification

1. **Smoke test**: Log in, run a payroll, view a payslip, export a report,
   log out.
2. **Check headers**: `curl -I https://yourdomain.com/api/dashboard` should
   include `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
   and `Content-Security-Policy`.
3. **Check cookie**: Session cookie should be named `__Host-payroll_session`
   with `Secure; Path=/; HttpOnly; SameSite=Lax`.
4. **Check audit trail**: Run one mutation and verify an `AuditLog` row
   appears with the correct `businessId`, `action`, and `ipAddress`.
5. **Check encryption**: Verify `nationalId`, `accountNumber`, and `taxNumber`
   are stored encrypted in the database (ciphertext, not plaintext).

---

## 7. Rollback

- **Code**: Revert the Vercel deployment to the previous preview.
- **Database**: Prisma migrations are forward-only. To rollback a migration,
  create a new migration that reverses the change and deploy it.
- **Secrets**: Rotate `ENCRYPTION_KEY` and `SMTP_PASS` independently
  without redeploying.
