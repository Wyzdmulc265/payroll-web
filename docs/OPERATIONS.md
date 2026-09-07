# Operations Guide

Day-to-day operational procedures for WizTech Payroll Web.

---

## 1. User Management Workflows

### Creating a new business (SUPER_ADMIN)

1. Navigate to **Business Management** (`/businesses`).
2. Click **New Business**.
3. Enter business name and optional initial admin email/password.
4. The route creates the business, the initial admin, and their respective
   audit events in a single transaction.
5. The initial admin receives an email (if SMTP is configured) with their
   credentials.

### Adding users to a business (ADMIN)

1. Navigate to **Users** (`/users`).
2. Click **Add User**.
3. Enter email, password, role (`ADMIN`, `PAYROLL_OPERATOR`, or `VIEWER`).
4. The user receives an email (if SMTP is configured) with their credentials.

### Password reset (any authenticated user)

1. Click **Forgot password** on the login page.
2. Enter email and optional business name.
3. The system sends a reset link to the email (if SMTP is configured).
4. Click the link, enter a new password, and log in.

### Self-service account update (any user)

1. Navigate to **Settings** → **Account** tab (SUPER_ADMIN) or use the
   account page.
2. Update email and/or password.
3. Changing the password invalidates all sessions and forces re-login.

---

## 2. Audit Log Review

### Viewing audit logs (ADMIN / SUPER_ADMIN)

1. Navigate to **Audit Logs** (`/audit-logs`).
2. Use the filter bar to narrow by:
   - Date range (defaults to last 30 days)
   - Action type (EMPLOYEE_CREATED, PAYROLL_RUN, etc.)
   - Entity type (Employee, Payroll, Settings, etc.)
   - Free-text search across action, entity, and description
3. For SUPER_ADMIN: use the business select to narrow to a single tenant.
4. Click a row to expand `oldValue` / `newValue` JSON snapshots.

### Exporting audit logs

1. Apply filters as needed.
2. Click **Export CSV**.
3. Cells are escaped with CWE-1236 prefix (`'` for `=`, `@`, `+`, `-`, tab, CR).
4. UTF-8 BOM is prepended for Excel compatibility.

---

## 3. Payroll Operations

### Running payroll

1. Navigate to **Payroll** (`/payroll`).
2. Select a period (YYYY-MM).
3. Click **Load** — the page fetches all active employees.
4. Enter overtime hours, bonuses, other earnings, and other deductions per row.
5. Click **Calculate** — the page computes payroll locally using the engine.
6. Review the preview; fix any validation errors.
7. Click **Save** — the server creates `PayrollRecord`s in a single transaction.
8. An `AuditLog` row is written with `action: 'PAYROLL_RUN'`.

### Re-running payroll

If rates change or data is corrected, delete the existing `PayrollRecord`s
for the period (or change the period) and re-run. The `@@unique([payrollPeriod,
employeeId])` constraint prevents double-paying.

### FBT review

1. Navigate to **Payroll** → run payroll with `fringeBenefitData`.
2. The server stores `fbtSnapshot` on each `PayrollRecord`.
3. Navigate to **FBT** (`/fbt?period=...&employeeId=...`) or view the
   payslip to see the FBT breakdown.

---

## 4. Settings Management

### Updating statutory rates

1. Navigate to **Settings** → **STATUTORY** tab.
2. Edit PAYE bands, pension rates, TEVET, FBT rate, or overtime multipliers.
3. Click **Save** — the settings are batch-upserted atomically.
4. The engine validates tax bands for gaps/overlaps before writing.
5. Future runs use the new rates; historical `PayrollRecord`s retain their
   `configSnapshot`.

### Managing departments

1. Navigate to **Settings** → **COMPANY** tab.
2. Use the **Departments** editor to add/remove departments.
3. The list is saved as `company.departments` JSON.
4. The employee form and filter dropdowns pick up the new list on next load.

---

## 5. Troubleshooting

### Session expires immediately

- Check `SESSION_DURATION_DAYS` in `.env`.
- Verify `DATABASE_URL` is reachable (session validation requires DB).
- Check that the `Session` row's `expires_at` is in the future.

### Payroll run fails with 500

- Check the server logs for the actual error.
- Common causes: missing statutory settings, invalid tax bands, DB connection
  timeout.
- Verify `Settings` has all required `STATUTORY` keys for the selected period.

### Password reset email not received

- Check `SMTP_*` environment variables.
- Verify Brevo sender email is verified in the Brevo dashboard.
- Check server logs for nodemailer errors.
- The route always returns 200 (no enumeration), so a "success" response
  does not guarantee delivery.

### Employee duplicate national ID error

- The route checks `nationalIdHash` per business.
- If two employees in the same business have the same national ID, the
  second create/update is rejected with `400`.
- Different businesses can have employees with the same national ID.

### Database migration fails

- Run `npx prisma migrate status` to see pending/failed migrations.
- If a migration partially applied, fix the SQL and re-run.
- Never modify an applied migration; create a new one to reverse it.

---

## 6. Backup and Restore

### Database backup

```bash
pg_dump -Fc -f backup.dump $DATABASE_URL
```

### Database restore

```bash
pg_restore -d $DATABASE_URL backup.dump
```

### What to back up

- **Database**: all data (employees, payroll records, audit logs, settings).
- **`.env`**: secrets (encryption key, SMTP credentials).
- **`prisma/migrations/`**: schema version history (already in Git).

---

## 7. Monitoring

- **Error logs**: `console.error` in route handlers. Consider adding
  structured logging (e.g. Pino) for production.
- **Database**: Neon provides query performance and connection metrics.
- **Vercel**: deployment logs, function execution times, and edge network
  metrics are available in the Vercel dashboard.
