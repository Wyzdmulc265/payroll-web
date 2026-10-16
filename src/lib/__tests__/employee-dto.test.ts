import { describe, expect, it } from 'vitest';
import { employeeDtoForRole } from '@/lib/employee-dto';

describe('employeeDtoForRole', () => {
  const employee = {
    id: 'employee-1',
    nationalId: 'ID-123',
    accountNumber: 'ACCOUNT-123',
    bankName: 'Example Bank',
    taxNumber: 'TAX-123',
    notes: 'Private note',
  };

  it('redacts private fields for VIEWER', () => {
    expect(employeeDtoForRole(employee, 'VIEWER')).toMatchObject({
      id: employee.id,
      nationalId: null,
      accountNumber: null,
      bankName: null,
      taxNumber: null,
      notes: null,
    });
  });

  it('preserves private fields for ADMIN and PAYROLL_OPERATOR', () => {
    expect(employeeDtoForRole(employee, 'ADMIN')).toEqual(employee);
    expect(employeeDtoForRole(employee, 'PAYROLL_OPERATOR')).toEqual(employee);
  });
});