# WizTech Payroll Web App

A modern, full-stack payroll management application for Malawi, built with Next.js 16, Prisma, PostgreSQL (Neon), and TypeScript.

## 🏗️ Architecture

```
payroll-web/
├── prisma/
│   ├── schema.prisma      # Database schema (Employees, PayrollRecords, AuditLogs, Settings)
│   └── seed.ts            # Seed script with sample data
├── src/
│   ├── app/               # Next.js App Router pages
│   │   ├── api/           # API routes
│   │   │   ├── employees/         # Employee CRUD
│   │   │   ├── payroll/           # Payroll calculation & processing
│   │   │   ├── payslips/          # Payslip generation
│   │   │   ├── reports/           # 6 report types
│   │   │   ├── dashboard/         # KPIs & charts
│   │   │   └── settings/          # Configuration management
│   │   ├── dashboard/             # Management dashboard with charts
│   │   ├── employees/             # Employee management UI
│   │   ├── payroll/               # Payroll processing UI
│   │   ├── payslips/              # Payslip viewer & PDF export
│   │   ├── reports/               # Report generator
│   │   └── settings/              # System configuration
│   ├── lib/
│   │   ├── payroll-engine.ts      # Pure TS Malawi payroll calculations
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── utils.ts               # Utility functions
├── .env                     # Environment variables (DATABASE_URL, NEXTAUTH_SECRET)
├── package.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Neon PostgreSQL database (or any PostgreSQL)
- npm or yarn

### Installation

```bash
cd payroll-web

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Push schema to database (requires DATABASE_URL in .env)
npm run prisma:push

# Seed with sample data
npm run prisma:seed

# Or run all at once
npm run db:setup

# Start development server
npm run dev
```

### Environment Variables

Create `.env` file:
```env
# Neon PostgreSQL connection string
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## 📊 Features

### Core Payroll Engine (`src/lib/payroll-engine.ts`)
- **PAYE Calculation**: Malawi 2024/2025 progressive tax bands (6 bands, 0%-40%)
- **Pension**: Employee 5%, Employer 10% (capped at MWK 1,000,000)
- **TEVET Levy**: 1% of gross (employer)
- **Overtime**: Hours × Rate × (Basic / WorkingDays / WorkingHours)
- **Gross Earnings**: Basic + Allowances + OT + Bonuses + Other
- **Net Pay**: Gross - (PAYE + Pension EE + Other Deductions)
- **Employer Cost**: Gross + Pension ER + TEVET Levy

### Pages

| Page | Features |
|------|----------|
| **Dashboard** | KPIs, bar charts, area charts, pie charts, headcount trends |
| **Employees** | CRUD, search, filter by department/status, pagination |
| **Payroll** | Load employees, enter OT/bonuses, calculate, validate, save |
| **Payslips** | Select period/employee, view, print, export PDF |
| **Reports** | 6 types: Register, Summary, Statutory, Dept, Bank, History |
| **Settings** | Category tabs (Company/Payroll/Statutory/System), CRUD |

### API Routes

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/employees` | GET, POST | List/create employees |
| `/api/employees/[id]` | GET, PUT, DELETE | Employee CRUD |
| `/api/payroll/calculate` | POST | Calculate single payroll |
| `/api/payroll` | GET, POST | List/run payroll |
| `/api/payslips/[id]` | GET | Get payslip data |
| `/api/reports` | GET | Generate reports |
| `/api/dashboard` | GET | Dashboard KPIs & charts |
| `/api/settings` | GET, POST | Settings CRUD |

## 🗄️ Database Schema

### Employees
- `employeeId` (unique, EMP001 format)
- Personal info, employment details
- Salary, allowances, banking
- Pension/tax configuration
- Soft delete via `isActive`

### PayrollRecords
- Period-based (YYYY-MM)
- Complete earnings & deductions breakdown
- Employee snapshot (dept, position)
- Unique constraint: period + employee

### AuditLogs
- All significant actions
- Old/new values for changes
- IP tracking ready

### Settings
- Key-value with categories
- Effective dating
- Supports all statutory parameters

## 🧮 Payroll Workflow

1. **Settings** → Configure company, payroll period, statutory rates
2. **Employees** → Add active employees with salaries
3. **Payroll** → Select period → Load employees → Enter OT/bonuses → Calculate → Validate → Save
4. **Payslips** → Select period/employee → View/Print/Export PDF
5. **Reports** → Select type/period/dept → Generate → Export CSV/Excel
6. **Dashboard** → Select period → View KPIs & charts

## 🧪 Testing Payroll Engine

The payroll engine has a Vitest unit-test suite. Run it with:

```bash
npm test        # or npx vitest run
```

Tests live in `src/lib/payroll-engine.test.ts` and cover PAYE band
boundaries, pension (incl. the cap), TEVET levy, overtime and full
`calculatePayroll` output, plus `buildStatutoryConfigFromSettings`.

You can also evaluate the engine directly from Node/tsx:

// Test case 1: High earner (800,000 MWK)
const result1 = calculatePayroll({
  basicSalary: 800000,
  allowances: 150000,
  overtimeHours: 10,
  overtimeRate: 1.5,
  bonuses: 50000,
  otherEarnings: 0,
  otherDeductions: 0,
}, DEFAULT_STATUTORY_CONFIG);

console.log(result1);
// { grossEarnings: 1000000, paye: 305000, pensionEE: 50000, ... }

// Test case 2: Below tax threshold (80,000 MWK)
const result2 = calculatePayroll({
  basicSalary: 80000,
  allowances: 0,
  overtimeHours: 0,
  overtimeRate: 1.5,
  bonuses: 0,
  otherEarnings: 0,
  otherDeductions: 0,
}, DEFAULT_STATUTORY_CONFIG);

console.log(result2);
// { grossEarnings: 80000, paye: 0, pensionEE: 4000, ... }
```

## 🔧 Development

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint
npm run lint

# Prisma Studio (visual DB)
npx prisma studio
```

## 🚢 Deployment (Vercel)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables:
   - `DATABASE_URL` (Neon connection string)
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (your Vercel URL)
4. Deploy

Vercel will auto-detect Next.js and configure build.

## 📝 License

Internal use - WizTech Solutions Ltd