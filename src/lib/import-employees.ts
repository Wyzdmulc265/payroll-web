import { z } from 'zod';

export const importEmployeeRowSchema = z.object({
  employeeId: z.string().regex(/^EMP\d{3}$/, 'Employee ID must be EMP followed by 3 digits'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  nationalId: z.string().optional().or(z.literal('')),
  department: z.string().min(1, 'Department is required'),
  position: z.string().min(1, 'Position is required'),
  employmentDate: z.string().min(1, 'Employment date is required'),
  employmentType: z.enum(['Permanent', 'Contract']).default('Permanent'),
  basicSalary: z.coerce.number().positive('Basic salary must be greater than 0'),
  salaryFrequency: z.enum(['Monthly', 'Weekly', 'Fortnightly']).default('Monthly'),
  allowances: z.coerce.number().nonnegative().default(0),
  bankName: z.string().optional().or(z.literal('')),
  accountNumber: z.string().optional().or(z.literal('')),
  paymentMethod: z.enum(['Bank Transfer', 'Cash', 'Mobile Money']).default('Bank Transfer'),
  pensionApplicable: z.coerce.boolean().default(true),
  taxStatus: z.enum(['Taxable', 'Exempt']).default('Taxable'),
  taxNumber: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export type ImportEmployeeRow = z.infer<typeof importEmployeeRowSchema>;

export const IMPORT_COLUMNS = [
  { key: 'employeeId', label: 'Employee ID *', required: true },
  { key: 'firstName', label: 'First Name *', required: true },
  { key: 'lastName', label: 'Last Name *', required: true },
  { key: 'nationalId', label: 'National ID', required: false },
  { key: 'department', label: 'Department *', required: true },
  { key: 'position', label: 'Position *', required: true },
  { key: 'employmentDate', label: 'Employment Date *', required: true },
  { key: 'employmentType', label: 'Employment Type', required: false },
  { key: 'basicSalary', label: 'Basic Salary (MWK) *', required: true },
  { key: 'salaryFrequency', label: 'Salary Frequency', required: false },
  { key: 'allowances', label: 'Allowances (MWK)', required: false },
  { key: 'bankName', label: 'Bank Name', required: false },
  { key: 'accountNumber', label: 'Account Number', required: false },
  { key: 'paymentMethod', label: 'Payment Method', required: false },
  { key: 'pensionApplicable', label: 'Pension Applicable', required: false },
  { key: 'taxStatus', label: 'Tax Status', required: false },
  { key: 'taxNumber', label: 'Tax Number (TPIN)', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const;
