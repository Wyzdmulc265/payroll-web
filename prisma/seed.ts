import 'dotenv/config';
import { PrismaClient } from './generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { encryptPii } from '../src/lib/encryption';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function hashNationalId(nationalId: string): string {
  return createHash('sha256').update(nationalId.trim().toLowerCase()).digest('hex');
}

async function main() {
  console.log('🌱 Seeding database...');

  const bootstrapEmail = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
  const bootstrapPassword = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  if (!bootstrapEmail || !bootstrapPassword || bootstrapPassword.length < 8) {
    throw new Error('BOOTSTRAP_SUPER_ADMIN_EMAIL and a password of at least 8 characters are required');
  }

  // Clear existing data (in order due to foreign keys)
  await prisma.fringeBenefit.deleteMany();
  await prisma.payrollRecord.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();

  const businesses = [
    { id: 'test-biz-001', name: 'Test Business' },
    { id: 'test-biz-002', name: 'Test Business B' },
  ];

  for (const bizDef of businesses) {
    await prisma.business.upsert({
      where: { id: bizDef.id },
      update: { name: bizDef.name, status: 'ACTIVE' },
      create: { id: bizDef.id, name: bizDef.name, status: 'ACTIVE' },
    });
  }

  const businessA = await prisma.business.findUnique({ where: { id: 'test-biz-001' } });
  const businessB = await prisma.business.findUnique({ where: { id: 'test-biz-002' } });
  if (!businessA || !businessB) {
    throw new Error('Failed to create seed businesses');
  }

  // Email is unique per business (@@unique([email, businessId])), so seed
  // users are matched on the (email, businessId) pair via findFirst rather
  // than an email-keyed upsert.
  async function seedUser(
    email: string,
    businessId: string | null,
    password: string,
    role: 'SUPER_ADMIN' | 'ADMIN' | 'PAYROLL_OPERATOR' | 'VIEWER',
  ) {
    const existing = await prisma.user.findFirst({ where: { email, businessId } });
    const passwordHash = await bcrypt.hash(password, 10);
    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, role, status: 'ACTIVE', businessId },
      });
    }
    return prisma.user.create({
      data: { email, passwordHash, role, status: 'ACTIVE', businessId },
    });
  }

  await seedUser(bootstrapEmail.toLowerCase(), null, bootstrapPassword, 'SUPER_ADMIN');
  await seedUser('admin-a@testbiz.local', businessA.id, 'AdminTest123', 'ADMIN');
  await seedUser('operator-a@testbiz.local', businessA.id, 'OperatorTest123', 'PAYROLL_OPERATOR');
  await seedUser('admin-b@testbiz.local', businessB.id, 'AdminTest123', 'ADMIN');
  await seedUser('operator-b@testbiz.local', businessB.id, 'OperatorTest123', 'PAYROLL_OPERATOR');
  // Seed Settings for each business
  console.log('📋 Seeding settings...');
  
  const settingDefs = [
    { key: 'company.departments', value: JSON.stringify(['Admin', 'Finance', 'HR', 'IT', 'Sales']), description: 'Department list for the employee form', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_name', value: 'WizTech Solutions Ltd', description: 'Legal company name', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_address', value: 'P.O. Box 1234, Blantyre, Malawi', description: 'Registered address', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_phone', value: '+265 1 123 4567', description: 'Contact phone', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_email', value: 'payroll@wiztech.mw', description: 'Payroll email', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_tpin', value: 'TPIN12345678', description: 'Tax Payer Identification Number', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_pension_fund', value: 'NICO Pension Fund', description: 'Registered pension fund', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'payroll_frequency', value: 'Monthly', description: 'Payroll frequency', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'current_payroll_period', value: '2026-08', description: 'Current payroll period (YYYY-MM)', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'period_start_day', value: '1', description: 'Day of month period starts', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'period_end_day', value: '31', description: 'Day of month period ends', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'working_hours_per_day', value: '8', description: 'Standard working hours', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'working_days_per_month', value: '22', description: 'Standard working days', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'overtime_normal_rate_multiplier', value: '1.5', description: 'Normal day overtime rate multiplier', category: 'PAYROLL', effectiveFrom: new Date('2026-01-01') },
    { key: 'overtime_public_holiday_rate_multiplier', value: '2.0', description: 'Public holiday overtime rate multiplier', category: 'PAYROLL', effectiveFrom: new Date('2026-01-01') },
    { key: 'overtime_off_day_rate_multiplier', value: '2.0', description: 'Off-day overtime rate multiplier', category: 'PAYROLL', effectiveFrom: new Date('2026-01-01') },
    { key: 'currency', value: 'MWK', description: 'Malawi Kwacha', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'decimal_places', value: '2', description: 'Rounding precision', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'statutory.paye_band_1_from', value: '0', description: 'Band 1 from amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_1_to', value: '170000', description: 'Band 1 to amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_1_rate', value: '0', description: 'Band 1 rate %', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_2_from', value: '170001', description: 'Band 2 from amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_2_to', value: '1570000', description: 'Band 2 to amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_2_rate', value: '30', description: 'Band 2 rate %', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_3_from', value: '1570001', description: 'Band 3 from amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_3_to', value: '10000000', description: 'Band 3 to amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_3_rate', value: '35', description: 'Band 3 rate %', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_4_from', value: '10000001', description: 'Band 4 from amount', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_4_to', value: '9007199254740991', description: 'Band 4 to amount (unbounded = Number.MAX_SAFE_INTEGER)', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.paye_band_4_rate', value: '40', description: 'Band 4 rate %', category: 'STATUTORY', effectiveFrom: new Date('2026-01-01') },
    { key: 'statutory.pension_ee_rate', value: '5', description: 'Employee pension contribution %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.pension_er_rate', value: '10', description: 'Employer pension contribution %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.max_pensionable_income', value: '1000000', description: 'Maximum income for pension calc', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.pension_fund_name', value: 'NICO', description: 'Default pension fund', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.tevet_levy_rate', value: '1', description: 'TEVET levy (employer) % of gross', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.fringe_benefit_tax_rate', value: '30', description: 'Fringe benefit tax rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.leave_days_per_year', value: '24', description: 'Annual leave entitlement', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.sick_days_per_year', value: '14', description: 'Sick leave entitlement', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'default_report_period', value: 'Current Month', description: 'Default period for reports', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'number_format', value: '#,##0.00', description: 'Default number format', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'date_format', value: 'DD/MM/YYYY', description: 'Default date format', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'auto_calculate', value: 'true', description: 'Auto-calculate on change', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'backup_enabled', value: 'true', description: 'Enable auto-backup', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'audit_log_enabled', value: 'true', description: 'Enable audit logging', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
  ];

  for (const biz of [businessA, businessB]) {
    for (const setting of settingDefs) {
      await prisma.settings.upsert({
        where: {
          key_businessId_effectiveFrom: {
            key: setting.key,
            businessId: biz.id,
            effectiveFrom: setting.effectiveFrom,
          },
        },
        update: { ...setting, businessId: biz.id },
        create: { ...setting, businessId: biz.id },
      });
    }
  }

  // Seed Employees
  console.log('👥 Seeding employees...');

  const employeeDefs: Array<{ businessId: string; employeeId: string; firstName: string; lastName: string; nationalId: string; department: string; position: string; employmentDate: Date; basicSalary: number; bankName: string; accountNumber: string }> = [
    { businessId: businessA.id, employeeId: 'EMP001', firstName: 'Alice', lastName: 'Banda', nationalId: '123456789001', department: 'IT', position: 'Software Engineer', employmentDate: new Date('2022-01-15'), basicSalary: 800000, bankName: 'National Bank', accountNumber: '1111111111' },
    { businessId: businessA.id, employeeId: 'EMP002', firstName: 'Bob', lastName: 'Phiri', nationalId: '123456789002', department: 'Finance', position: 'Accountant', employmentDate: new Date('2021-03-20'), basicSalary: 650000, bankName: 'Standard Bank', accountNumber: '2222222222' },
    { businessId: businessB.id, employeeId: 'EMP001', firstName: 'Alice', lastName: 'Banda', nationalId: '123456789001', department: 'IT', position: 'Software Engineer', employmentDate: new Date('2022-01-15'), basicSalary: 800000, bankName: 'National Bank', accountNumber: '1111111111' },
    { businessId: businessB.id, employeeId: 'EMP002', firstName: 'Bob', lastName: 'Phiri', nationalId: '123456789002', department: 'Finance', position: 'Accountant', employmentDate: new Date('2021-03-20'), basicSalary: 650000, bankName: 'Standard Bank', accountNumber: '2222222222' },
  ];

  for (const emp of employeeDefs) {
    const nationalIdHash = emp.nationalId ? hashNationalId(emp.nationalId) : null;
    const encryptedPii = encryptPii({
      nationalId: emp.nationalId,
      accountNumber: emp.accountNumber,
      taxNumber: null,
    });
    await prisma.employee.create({
      data: {
        employeeId: emp.employeeId,
        businessId: emp.businessId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        fullName: `${emp.firstName} ${emp.lastName}`,
        nationalId: encryptedPii.nationalId,
        nationalIdHash,
        employmentStatus: 'Active',
        department: emp.department,
        position: emp.position,
        employmentDate: emp.employmentDate,
        employmentType: 'Permanent',
        basicSalary: emp.basicSalary,
        salaryFrequency: 'Monthly',
        allowances: 0,
        bankName: emp.bankName,
        accountNumber: encryptedPii.accountNumber,
        paymentMethod: 'Bank Transfer',
        pensionApplicable: true,
        taxStatus: 'Taxable',
        taxNumber: encryptedPii.taxNumber,
        notes: null,
        isActive: true,
      },
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log(`   - ${settingDefs.length * 2} settings (${settingDefs.length} per business)`);
  console.log(`   - ${employeeDefs.length} employees (${employeeDefs.length / 2} per business)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });