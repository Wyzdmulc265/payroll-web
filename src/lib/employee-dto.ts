import type { Role } from '../../prisma/generated/client';

type EmployeePii = {
  nationalId?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
};

export function employeeDtoForRole<T extends EmployeePii>(employee: T, role: Role): T {
  if (role !== 'VIEWER') return employee;

  return {
    ...employee,
    nationalId: null,
    accountNumber: null,
    bankName: null,
    taxNumber: null,
    notes: null,
  };
}