import { PrismaClient } from '@prisma/client';
import { DEFAULT_STATUTORY_CONFIG } from '@/lib/payroll-engine';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data (in order due to foreign keys)
  await prisma.auditLog.deleteMany();
  await prisma.payrollRecord.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.settings.deleteMany();

  // Seed Settings
  console.log('📋 Seeding settings...');
  
  const settings = [
    // Company Settings
    { key: 'company_name', value: 'WizTech Solutions Ltd', description: 'Legal company name', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_address', value: 'P.O. Box 1234, Blantyre, Malawi', description: 'Registered address', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_phone', value: '+265 1 123 4567', description: 'Contact phone', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_email', value: 'payroll@wiztech.mw', description: 'Payroll email', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_tpin', value: 'TPIN12345678', description: 'Tax Payer Identification Number', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },
    { key: 'company_pension_fund', value: 'NICO Pension Fund', description: 'Registered pension fund', category: 'COMPANY', effectiveFrom: new Date('2024-01-01') },

    // Payroll Settings
    { key: 'payroll_frequency', value: 'Monthly', description: 'Payroll frequency', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'current_payroll_period', value: '2026-08', description: 'Current payroll period (YYYY-MM)', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'period_start_day', value: '1', description: 'Day of month period starts', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'period_end_day', value: '31', description: 'Day of month period ends', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'working_hours_per_day', value: '8', description: 'Standard working hours', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'working_days_per_month', value: '22', description: 'Standard working days', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'overtime_rate_multiplier', value: '1.5', description: 'Overtime pay multiplier', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'currency', value: 'MWK', description: 'Malawi Kwacha', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },
    { key: 'decimal_places', value: '2', description: 'Rounding precision', category: 'PAYROLL', effectiveFrom: new Date('2024-01-01') },

    // Statutory Configuration - PAYE Tax Bands (2024/2025)
    { key: 'statutory.paye_band_1_from', value: '0', description: 'Band 1 from amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_1_to', value: '100000', description: 'Band 1 to amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_1_rate', value: '0', description: 'Band 1 rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_2_from', value: '100001', description: 'Band 2 from amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_2_to', value: '200000', description: 'Band 2 to amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_2_rate', value: '15', description: 'Band 2 rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_3_from', value: '200001', description: 'Band 3 from amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_3_to', value: '300000', description: 'Band 3 to amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_3_rate', value: '25', description: 'Band 3 rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_4_from', value: '300001', description: 'Band 4 from amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_4_to', value: '400000', description: 'Band 4 to amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_4_rate', value: '30', description: 'Band 4 rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_5_from', value: '400001', description: 'Band 5 from amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_5_to', value: '500000', description: 'Band 5 to amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_5_rate', value: '35', description: 'Band 5 rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_6_from', value: '500001', description: 'Band 6 from amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_6_to', value: '999999999', description: 'Band 6 to amount', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.paye_band_6_rate', value: '40', description: 'Band 6 rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },

    // Pension Configuration
    { key: 'statutory.pension_ee_rate', value: '5', description: 'Employee pension contribution %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.pension_er_rate', value: '10', description: 'Employer pension contribution %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.max_pensionable_income', value: '1000000', description: 'Maximum income for pension calc', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.pension_fund_name', value: 'NICO', description: 'Default pension fund', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },

    // Other Statutory
    { key: 'statutory.tevet_levy_rate', value: '1', description: 'TEVET levy (employer) % of gross', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.fringe_benefit_tax_rate', value: '30', description: 'Fringe benefit tax rate %', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.leave_days_per_year', value: '24', description: 'Annual leave entitlement', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },
    { key: 'statutory.sick_days_per_year', value: '14', description: 'Sick leave entitlement', category: 'STATUTORY', effectiveFrom: new Date('2024-07-01') },

    // System Settings
    { key: 'default_report_period', value: 'Current Month', description: 'Default period for reports', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'number_format', value: '#,##0.00', description: 'Default number format', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'date_format', value: 'DD/MM/YYYY', description: 'Default date format', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'auto_calculate', value: 'true', description: 'Auto-calculate on change', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'backup_enabled', value: 'true', description: 'Enable auto-backup', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
    { key: 'audit_log_enabled', value: 'true', description: 'Enable audit logging', category: 'SYSTEM', effectiveFrom: new Date('2024-01-01') },
  ];

  for (const setting of settings) {
    await prisma.settings.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting,
    });
  }

  // Seed Employees
  console.log('👥 Seeding employees...');
  
  const employees = [
    {
      employeeId: 'EMP001',
      firstName: 'John',
      lastName: 'Banda',
      fullName: 'John Banda',
      nationalId: '123456789012',
      employmentStatus: 'Active',
      department: 'IT',
      position: 'Software Engineer',
      employmentDate: new Date('2022-01-15'),
      employmentType: 'Permanent',
      basicSalary: 800000,
      salaryFrequency: 'Monthly',
      allowances: 150000,
      bankName: 'National Bank',
      accountNumber: '1234567890',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN001',
      notes: 'Senior developer',
      isActive: true,
    },
    {
      employeeId: 'EMP002',
      firstName: 'Mary',
      lastName: 'Phiri',
      fullName: 'Mary Phiri',
      nationalId: '123456789013',
      employmentStatus: 'Active',
      department: 'Finance',
      position: 'Accountant',
      employmentDate: new Date('2021-03-20'),
      employmentType: 'Permanent',
      basicSalary: 650000,
      salaryFrequency: 'Monthly',
      allowances: 100000,
      bankName: 'Standard Bank',
      accountNumber: '0987654321',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN002',
      notes: 'Finance team lead',
      isActive: true,
    },
    {
      employeeId: 'EMP003',
      firstName: 'Peter',
      lastName: 'Mwale',
      fullName: 'Peter Mwale',
      nationalId: '123456789014',
      employmentStatus: 'Active',
      department: 'HR',
      position: 'HR Manager',
      employmentDate: new Date('2020-07-10'),
      employmentType: 'Permanent',
      basicSalary: 750000,
      salaryFrequency: 'Monthly',
      allowances: 120000,
      bankName: 'NICO Bank',
      accountNumber: '1122334455',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN003',
      notes: 'HR department head',
      isActive: true,
    },
    {
      employeeId: 'EMP004',
      firstName: 'Grace',
      lastName: 'Chirwa',
      fullName: 'Grace Chirwa',
      nationalId: '123456789015',
      employmentStatus: 'Active',
      department: 'IT',
      position: 'DevOps Engineer',
      employmentDate: new Date('2023-02-01'),
      employmentType: 'Contract',
      basicSalary: 700000,
      salaryFrequency: 'Monthly',
      allowances: 100000,
      bankName: 'FDH Bank',
      accountNumber: '5566778899',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN004',
      notes: '6-month contract',
      isActive: true,
    },
    {
      employeeId: 'EMP005',
      firstName: 'David',
      lastName: 'Kamanga',
      fullName: 'David Kamanga',
      nationalId: '123456789016',
      employmentStatus: 'Active',
      department: 'Sales',
      position: 'Sales Manager',
      employmentDate: new Date('2019-11-05'),
      employmentType: 'Permanent',
      basicSalary: 900000,
      salaryFrequency: 'Monthly',
      allowances: 200000,
      bankName: 'National Bank',
      accountNumber: '9988776655',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN005',
      notes: 'Includes vehicle allowance',
      isActive: true,
    },
    {
      employeeId: 'EMP006',
      firstName: 'Lisa',
      lastName: 'Nkhoma',
      fullName: 'Lisa Nkhoma',
      nationalId: '123456789017',
      employmentStatus: 'Active',
      department: 'Admin',
      position: 'Office Administrator',
      employmentDate: new Date('2022-09-12'),
      employmentType: 'Permanent',
      basicSalary: 450000,
      salaryFrequency: 'Monthly',
      allowances: 50000,
      bankName: 'Standard Bank',
      accountNumber: '1111222233',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN006',
      notes: 'Part-time study',
      isActive: true,
    },
    {
      employeeId: 'EMP007',
      firstName: 'Robert',
      lastName: 'Sakala',
      fullName: 'Robert Sakala',
      nationalId: '123456789018',
      employmentStatus: 'Active',
      department: 'IT',
      position: 'System Administrator',
      employmentDate: new Date('2021-06-18'),
      employmentType: 'Permanent',
      basicSalary: 600000,
      salaryFrequency: 'Monthly',
      allowances: 80000,
      bankName: 'NICO Bank',
      accountNumber: '3333444455',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN007',
      notes: 'On-call rotation',
      isActive: true,
    },
    {
      employeeId: 'EMP008',
      firstName: 'Catherine',
      lastName: 'Zulu',
      fullName: 'Catherine Zulu',
      nationalId: '123456789019',
      employmentStatus: 'Inactive',
      department: 'Finance',
      position: 'Junior Accountant',
      employmentDate: new Date('2023-01-10'),
      employmentType: 'Permanent',
      basicSalary: 400000,
      salaryFrequency: 'Monthly',
      allowances: 30000,
      bankName: 'FDH Bank',
      accountNumber: '5555666677',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: 'TPIN008',
      notes: 'Resigned 2024-06-30',
      isActive: false,
    },
  ];

  for (const emp of employees) {
    await prisma.employee.create({ data: emp });
  }

  console.log('✅ Database seeded successfully!');
  console.log(`   - ${settings.length} settings`);
  console.log(`   - ${employees.length} employees`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });