import { Permission, hasPermission } from '@/lib/auth/permissions';
import type { Role } from '@/components/UserContext';

export type HowToSectionId =
  | 'dashboard'
  | 'employees'
  | 'payroll'
  | 'payslips'
  | 'reports'
  | 'settings'
  | 'fbt';

export interface HowToNavItem {
  id: HowToSectionId;
  label: string;
  href: string;
}

export const HOW_TO_NAV_ITEMS: HowToNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '#dashboard' },
  { id: 'employees', label: 'Employees', href: '#employees' },
  { id: 'payroll', label: 'Payroll', href: '#payroll' },
  { id: 'payslips', label: 'Payslips', href: '#payslips' },
  { id: 'reports', label: 'Reports', href: '#reports' },
  { id: 'settings', label: 'Settings', href: '#settings' },
  { id: 'fbt', label: 'FBT', href: '#fbt' },
];

const SECTION_PERMISSIONS: Record<HowToSectionId, readonly Permission[]> = {
  dashboard: [Permission.READ_PAYROLL],
  employees: [Permission.READ_EMPLOYEES, Permission.MANAGE_EMPLOYEES],
  payroll: [Permission.RUN_PAYROLL, Permission.READ_PAYROLL],
  payslips: [Permission.READ_PAYROLL],
  reports: [Permission.READ_REPORTS],
  settings: [Permission.READ_SETTINGS],
  fbt: [Permission.RUN_PAYROLL, Permission.READ_PAYROLL, Permission.READ_SETTINGS],
};

export function canViewHowTo(role: Role | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'PAYROLL_OPERATOR';
}

export function getVisibleHowToItems(role: Role | null | undefined): HowToNavItem[] {
  if (!canViewHowTo(role)) {
    return [];
  }

  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return HOW_TO_NAV_ITEMS;
  }

  return HOW_TO_NAV_ITEMS.filter((item) =>
    SECTION_PERMISSIONS[item.id].some((permission) => role != null && hasPermission(role, permission)),
  );
}