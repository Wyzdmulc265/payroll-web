import type { Role } from '../../../prisma/generated/client';

export const Permission = {
  READ_PAYROLL: 'read:payroll',
  RUN_PAYROLL: 'run:payroll',
  READ_EMPLOYEES: 'read:employees',
  MANAGE_EMPLOYEES: 'manage:employees',
  READ_SETTINGS: 'read:settings',
  MANAGE_SETTINGS: 'manage:settings',
  READ_REPORTS: 'read:reports',
  READ_AUDIT_LOGS: 'read:audit-logs',
  MANAGE_USERS: 'manage:users',
  MANAGE_BUSINESSES: 'manage:businesses',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: [Permission.MANAGE_BUSINESSES, Permission.MANAGE_USERS],
  ADMIN: [
    Permission.READ_PAYROLL, Permission.RUN_PAYROLL, Permission.READ_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES, Permission.READ_SETTINGS, Permission.MANAGE_SETTINGS,
    Permission.READ_REPORTS, Permission.READ_AUDIT_LOGS, Permission.MANAGE_USERS,
  ],
  PAYROLL_OPERATOR: [
    Permission.READ_PAYROLL, Permission.RUN_PAYROLL, Permission.READ_EMPLOYEES,
    Permission.READ_REPORTS,
  ],
  VIEWER: [Permission.READ_PAYROLL, Permission.READ_EMPLOYEES, Permission.READ_REPORTS],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
