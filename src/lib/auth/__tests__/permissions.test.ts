import { describe, expect, it } from 'vitest';
import { Permission, rolePermissions, hasPermission } from '@/lib/auth/permissions';
import type { Role } from '../../../../prisma/generated/client';

describe('permissions', () => {
  const roles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'PAYROLL_OPERATOR', 'VIEWER'];

  it('SUPER_ADMIN has MANAGE_BUSINESSES, READ_USERS, MANAGE_USERS, and READ_AUDIT_LOGS', () => {
    expect(rolePermissions.SUPER_ADMIN).toContain(Permission.MANAGE_BUSINESSES);
    expect(rolePermissions.SUPER_ADMIN).toContain(Permission.READ_USERS);
    expect(rolePermissions.SUPER_ADMIN).toContain(Permission.MANAGE_USERS);
    expect(rolePermissions.SUPER_ADMIN).toContain(Permission.READ_AUDIT_LOGS);
  });

  it('ADMIN has READ_AUDIT_LOGS', () => {
    expect(rolePermissions.ADMIN).toContain(Permission.READ_AUDIT_LOGS);
  });

  it('hasPermission resolves correctly for each role/permission pair', () => {
    for (const role of roles) {
      for (const perm of Object.values(Permission)) {
        const expected = rolePermissions[role as Role].includes(perm);
        expect(hasPermission(role, perm)).toBe(expected);
      }
    }
  });
});
