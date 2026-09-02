You are a senior full-stack software engineer responsible for implementing secure authentication and role-based authorization for an existing multi-business payroll application.

Before making changes, inspect the existing project architecture and Prisma schema carefully. Do not rewrite working payroll functionality unnecessarily.

The existing application structure is:

payroll-web/

├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── dashboard/page.tsx
│   │   ├── employees/page.tsx
│   │   ├── payroll/page.tsx
│   │   ├── payslips/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── dashboard/route.ts
│   │       ├── employees/route.ts
│   │       ├── employees/[id]/route.ts
│   │       ├── payroll/route.ts
│   │       ├── payroll/calculate/route.ts
│   │       ├── payslips/[id]/route.ts
│   │       ├── reports/route.ts
│   │       └── settings/route.ts
│   │
│   ├── components/
│   │   └── MainNav.tsx
│   │
│   └── lib/
│       ├── payroll-engine.ts
│       ├── payroll-engine.test.ts
│       ├── prisma.ts
│       └── utils.ts
│
└── docs/

The existing payroll engine must remain intact and independent from authentication, authorization, database session logic and audit logging.

Do not place authentication or database operations inside payroll-engine.ts.

The payroll engine must remain pure, deterministic and independently testable.

---

# 1. PRIMARY OBJECTIVE

Implement secure authentication and role-based access control for a multi-business payroll application.

The application must support multiple businesses.

Each business must have isolated data.

Users belonging to Business A must never be able to access, view, modify or operate on Business B's:

* Employees.
* Payroll.
* Payslips.
* Reports.
* Settings.
* Users.
* Audit logs.

Implement strong tenant isolation at the server and database-query level.

Do not rely only on frontend filtering or hidden UI elements.

---

# 2. USER ROLE HIERARCHY

Implement the following roles:

```text
SUPER_ADMIN
ADMIN
PAYROLL_OPERATOR
VIEWER
```

Use the following hierarchy:

```text
SUPER_ADMIN
      │
      ▼
Creates and manages Businesses
      │
      ▼
Creates the initial ADMIN for each Business
      │
      ▼
ADMIN
      │
      ├── Creates and manages PAYROLL_OPERATOR users
      │
      └── Creates and manages VIEWER users
```

A normal ADMIN must only manage users belonging to their own business.

An ADMIN must never:

* Create another SUPER_ADMIN.
* Access another business.
* Manage another business's users.
* Change platform-level settings.

---

# 3. SUPER_ADMIN RESPONSIBILITIES

SUPER_ADMIN is a platform-level role.

SUPER_ADMIN permissions include:

* Create a business.
* View businesses.
* Update business information.
* Activate or deactivate businesses.
* Create the initial ADMIN for a business.
* Reset administrator access where necessary.
* Manage business status.
* View platform-level administrative information.
* Manage platform-level user administration.

SUPER_ADMIN should not automatically receive access to every business's payroll records unless the application explicitly implements controlled support access.

If a Super Admin needs access to a business, this should be explicitly designed and auditable.

---

# 4. ADMIN RESPONSIBILITIES

ADMIN is the highest role within a business.

ADMIN permissions include:

## Employee Management

* View employees.
* Add employees.
* Edit employees.
* Manage employee information.
* Activate/deactivate employees where supported.

## Settings

* View settings.
* Update business settings.
* Update payroll settings.
* Update configuration settings that the business is permitted to manage.

## User Management

* Create PAYROLL_OPERATOR users.
* Create VIEWER users.
* Edit PAYROLL_OPERATOR users.
* Edit VIEWER users.
* Deactivate PAYROLL_OPERATOR users.
* Deactivate VIEWER users.

An ADMIN must not create another ADMIN unless this functionality is explicitly added later.

## Payroll Access

ADMIN should inherit the operational capabilities of PAYROLL_OPERATOR, including:

* View payroll.
* Run payroll.
* Generate payslips.
* Generate reports.
* Export reports.

---

# 5. PAYROLL_OPERATOR RESPONSIBILITIES

PAYROLL_OPERATOR is responsible for daily payroll operations.

PAYROLL_OPERATOR can:

* View employees.
* View employee information required for payroll.
* Calculate payroll.
* Run payroll.
* Save payroll runs where the existing workflow permits.
* View payroll history.
* Generate payslips.
* View payslips.
* Print or download payslips.
* Generate payroll reports.
* Export reports.

PAYROLL_OPERATOR must not:

* Create employees.
* Edit employees.
* Delete employees.
* Change business settings.
* Change payroll configuration.
* Change tax configuration.
* Create users.
* Edit users.
* Manage roles.

---

# 6. VIEWER RESPONSIBILITIES

VIEWER is strictly read-only.

VIEWER can:

* View employees.
* View payroll history.
* View payroll results.
* View payslips.
* View reports.

VIEWER must not:

* Create any records.
* Edit any records.
* Delete any records.
* Run payroll.
* Calculate and save payroll.
* Change settings.
* Generate data that changes application state.
* Create or manage users.

Enforce read-only restrictions on both the frontend and backend.

Do not rely on disabled buttons as the security mechanism.

The API must reject unauthorized write operations.

---

# 7. ROLE-PERMISSION MODEL

Do not scatter role checks throughout the application.

Create a centralized permission system.

Create:

```text
src/lib/auth/
```

with the following files:

```text
auth/
├── password.ts
├── session.ts
├── authorization.ts
├── roles.ts
└── permissions.ts
```

Define permissions such as:

```typescript
DASHBOARD_VIEW

BUSINESS_VIEW
BUSINESS_CREATE
BUSINESS_UPDATE

EMPLOYEE_VIEW
EMPLOYEE_CREATE
EMPLOYEE_UPDATE
EMPLOYEE_DELETE

PAYROLL_VIEW
PAYROLL_CALCULATE
PAYROLL_RUN
PAYROLL_SAVE

PAYSLIP_VIEW
PAYSLIP_GENERATE
PAYSLIP_EXPORT

REPORT_VIEW
REPORT_GENERATE
REPORT_EXPORT

SETTINGS_VIEW
SETTINGS_UPDATE

USER_VIEW
USER_CREATE
USER_UPDATE
USER_DEACTIVATE

AUDIT_LOG_VIEW
```

Map roles to permissions centrally.

Example:

```text
VIEWER
→ Read-only permissions

PAYROLL_OPERATOR
→ Read permissions
→ Payroll permissions
→ Payslip permissions
→ Report permissions

ADMIN
→ All business-level permissions

SUPER_ADMIN
→ Platform administration permissions
```

Create reusable functions such as:

```typescript
requireAuthenticatedUser()

requirePermission()

hasPermission()

requireBusinessAccess()
```

Every protected server-side action must use these functions.

---

# 8. AUTHENTICATION REQUIREMENTS

Implement secure authentication using the application's existing technology stack.

The authentication system should include:

* Email and password login.
* Secure password hashing.
* Secure session management.
* Login.
* Logout.
* Current-user endpoint.
* Account status checks.
* User deactivation.
* Secure password handling.

Create a login page:

```text
src/app/login/page.tsx
```

Create authentication API routes:

```text
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/me/route.ts
```

Use secure HTTP-only cookies for browser session management.

Use secure cookie settings appropriate to the deployment environment.

Do not expose passwords, password hashes, session tokens or sensitive credentials to the frontend.

Use a well-established password hashing library suitable for the current Node.js environment.

Do not implement custom cryptographic algorithms.

---

# 9. DATABASE DESIGN

Update Prisma schema appropriately.

Implement a Business model.

Conceptually:

```prisma
model Business {
  id        String   @id @default(cuid())

  name      String
  status    BusinessStatus @default(ACTIVE)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]

  employees Employee[]
}
```

Implement appropriate business-related models based on the existing schema.

All business-owned data must have a business identifier.

This may include:

* Employees.
* Payroll runs.
* Payslips.
* Reports where persisted.
* Settings.
* Audit logs.
* Users or user memberships.

Use the existing schema where possible rather than duplicating models.

---

# 10. USER MODEL

Implement a User model with appropriate fields such as:

```text
id
email
passwordHash
role
status
businessId where applicable
createdAt
updatedAt
```

A SUPER_ADMIN may be platform-level and therefore may not belong to a single business.

Normal business users should belong to exactly one business for this V1 implementation unless the existing architecture requires otherwise.

Use appropriate nullable relationships and constraints.

Example conceptual structure:

```text
SUPER_ADMIN
businessId = null

ADMIN
businessId = required

PAYROLL_OPERATOR
businessId = required

VIEWER
businessId = required
```

Validate this relationship at both application and database levels where practical.

---

# 11. SESSION MODEL

Implement secure sessions.

Conceptually:

```prisma
model Session {
  id        String   @id @default(cuid())

  userId    String
  user      User     @relation(fields: [userId], references: [id])

  tokenHash String   @unique

  expiresAt DateTime

  createdAt DateTime @default(now())

  ipAddress String?
  userAgent String?
}
```

Do not store raw session tokens in the database.

Generate a secure random token.

Store only a cryptographic hash of the token.

Store the raw token only inside the secure browser cookie.

Session requirements:

* HttpOnly.
* Secure in production.
* Appropriate SameSite policy.
* Session expiration.
* Logout must invalidate the server-side session.

---

# 12. MULTI-TENANT DATA ISOLATION

This is a critical requirement.

Every business-level API request must verify:

```text
Authenticated User
        ↓
User Role
        ↓
User Business
        ↓
Requested Resource Business
        ↓
Allow or Deny
```

Example:

A PAYROLL_OPERATOR from Business A requests:

```text
GET /api/employees/[id]
```

The server must verify that:

```text
employee.businessId === user.businessId
```

before returning data.

Do not accept a business ID supplied by the frontend as proof of authorization.

The business context must come from the authenticated server-side user/session.

All Prisma queries for business-owned records should be scoped by the authenticated user's business.

---

# 13. API ROUTE PROTECTION

Protect every existing API route.

This includes:

```text
/api/dashboard
/api/employees
/api/employees/[id]
/api/payroll
/api/payroll/calculate
/api/payslips/[id]
/api/reports
/api/settings
```

For each route:

1. Authenticate user.
2. Determine role.
3. Determine business context.
4. Check permission.
5. Scope database queries to the business.
6. Execute operation.
7. Return only authorized data.

Do not allow unauthenticated API access.

Do not rely only on protecting pages.

The API itself must be secure.

---

# 14. FRONTEND ACCESS CONTROL

Update MainNav.tsx and other navigation components.

Users should only see navigation items they are permitted to use.

For example:

```text
SUPER_ADMIN
→ Platform administration

ADMIN
→ Dashboard
→ Employees
→ Payroll
→ Payslips
→ Reports
→ Settings
→ User Management

PAYROLL_OPERATOR
→ Dashboard
→ Employees (read-only)
→ Payroll
→ Payslips
→ Reports

VIEWER
→ Dashboard
→ Employees (read-only)
→ Payroll history (read-only)
→ Payslips
→ Reports
```

However, remember:

Hiding navigation items is only a user experience improvement.

It is not the security mechanism.

Server-side authorization remains mandatory.

---

# 15. AUDIT LOG INTEGRATION

Integrate authentication and role management with the existing audit logging architecture.

Create audit records for important events including:

```text
LOGIN_SUCCESS
LOGIN_FAILED
LOGOUT

BUSINESS_CREATED
BUSINESS_UPDATED
BUSINESS_STATUS_CHANGED

USER_CREATED
USER_UPDATED
USER_DEACTIVATED
USER_ROLE_CHANGED

EMPLOYEE_CREATED
EMPLOYEE_UPDATED
EMPLOYEE_DEACTIVATED

PAYROLL_CALCULATED
PAYROLL_RUN_CREATED
PAYROLL_SAVED
PAYROLL_FINALIZED
PAYROLL_VOIDED

SETTINGS_UPDATED
REPORT_EXPORTED
PAYSLIP_GENERATED
```

Each audit record should capture:

```text
Who performed the action?

What action occurred?

What resource was affected?

Which business was involved?

When did it happen?

What was the previous state?

What is the new state?

Relevant request metadata.
```

Do not store sensitive data unnecessarily.

Never store:

* Passwords.
* Password hashes.
* Raw session tokens.
* Authentication cookies.
* Full sensitive credentials.

---

# 16. ADD AUDIT LOGS TO THE DATABASE

Create or update the AuditLog Prisma model.

It should support:

```text
id

businessId

actorId

action

entityType
entityId

previousData
newData

metadata

ipAddress
userAgent

createdAt
```

Use JSON/JSONB for structured previous and new data where appropriate.

Audit logs must not be editable by normal application users.

Only authorized users may view audit logs.

---

# 17. USER MANAGEMENT

Create user management functionality for administrators.

Recommended routes:

```text
src/app/users/page.tsx

src/app/api/users/route.ts

src/app/api/users/[id]/route.ts
```

ADMIN can manage users only within their own business.

ADMIN can create:

```text
PAYROLL_OPERATOR
VIEWER
```

ADMIN cannot create:

```text
SUPER_ADMIN
```

SUPER_ADMIN creates:

```text
Business

Initial ADMIN for Business
```

Prevent role escalation.

Example:

A VIEWER must never be able to send a manipulated request to become an ADMIN.

The server must independently validate:

```text
Actor Role
+
Requested Role
+
Business Scope
```

before creating or updating a user.

---

# 18. PRESERVE THE EXISTING PAYROLL ENGINE

Do not modify payroll-engine.ts to include:

* Prisma.
* Authentication.
* Authorization.
* Sessions.
* Cookies.
* Audit logs.

The architecture must remain:

```text
UI / API
    ↓
Authentication
    ↓
Authorization
    ↓
Business Service
    ↓
Payroll Engine
    ↓
Calculation Result
    ↓
Database Persistence
    ↓
Audit Log
```

The existing payroll-engine.test.ts suite must continue to pass.

Add additional tests without weakening or removing existing tests.

---

# 19. DATABASE TRANSACTIONS

For critical operations, perform the business operation and audit-log creation within the same database transaction where practical.

Examples:

```text
Create Employee
+
Create Audit Log
```

and:

```text
Finalize Payroll
+
Save Calculation Snapshot
+
Create Audit Log
```

The system should avoid situations where the business record changes but the audit log fails.

---

# 20. REQUIRED TESTING

Create tests for:

## Authentication

* Valid login.
* Invalid password.
* Unknown user.
* Suspended user.
* Expired session.
* Logout.
* Invalid session token.

## Authorization

* VIEWER cannot edit employees.
* VIEWER cannot run payroll.
* PAYROLL_OPERATOR cannot edit employees.
* PAYROLL_OPERATOR cannot change settings.
* PAYROLL_OPERATOR can run payroll.
* PAYROLL_OPERATOR can generate reports.
* ADMIN can create employees.
* ADMIN can edit employees.
* ADMIN can update settings.
* ADMIN can create PAYROLL_OPERATOR users.
* ADMIN can create VIEWER users.
* ADMIN cannot create SUPER_ADMIN users.
* SUPER_ADMIN can create businesses.
* SUPER_ADMIN can create initial ADMIN users.

## Tenant Isolation

Test that a user from Business A cannot:

* View Business B employees.
* Edit Business B employees.
* Run payroll for Business B.
* Access Business B payslips.
* Access Business B settings.
* Access Business B users.

These tests are mandatory.

---

# 21. IMPLEMENTATION ORDER

Implement in this order:

STEP 1:
Inspect the existing Prisma schema and identify the current relationships.

STEP 2:
Write a migration plan before changing the schema.

STEP 3:
Add Business, User, Session and required audit relationships.

STEP 4:
Run Prisma migrations safely.

STEP 5:
Create a secure initial SUPER_ADMIN bootstrap mechanism.

Do not leave a hard-coded Super Admin password in seed.ts or source code.

Use environment-based credentials or a secure one-time setup mechanism.

STEP 6:
Implement authentication.

STEP 7:
Implement centralized authorization and permissions.

STEP 8:
Protect API routes.

STEP 9:
Implement business-level data isolation.

STEP 10:
Add login and user-management interfaces.

STEP 11:
Integrate audit logging.

STEP 12:
Update navigation based on permissions.

STEP 13:
Add comprehensive tests.

---

# 22. FINAL REQUIREMENTS

Do not:

* Rewrite the existing payroll engine.
* Break existing payroll calculations.
* Trust the frontend for authorization.
* Allow cross-business data access.
* Hard-code passwords.
* Store raw passwords.
* Store raw session tokens in the database.
* Allow role escalation.
* Allow a VIEWER to mutate data.
* Allow a PAYROLL_OPERATOR to modify employees or settings.
* Allow an ADMIN to access another business.
* Allow an ADMIN to create a SUPER_ADMIN.

The final implementation must provide:

1. Secure login and logout.
2. SUPER_ADMIN platform administration.
3. Business creation.
4. Initial business administrator creation.
5. ADMIN business management.
6. PAYROLL_OPERATOR payroll operations.
7. VIEWER read-only access.
8. Strong server-side authorization.
9. Multi-business data isolation.
10. Secure session handling.
11. User management.
12. Audit logging for critical actions.
13. Protected API routes.
14. Comprehensive automated tests.
15. Documentation explaining the authentication and authorization architecture.

Before making major changes, first inspect the existing Prisma schema and existing API route logic. Adapt the implementation to the actual existing models rather than assuming model names or relationships.

At the end of the implementation, provide:

* A summary of files created.
* A summary of files modified.
* Prisma schema changes.
* Migration steps.
* Environment variables required.
* A role-permission matrix.
* Security decisions made.
* Tests added and test results.
* Any assumptions or areas requiring further review.
