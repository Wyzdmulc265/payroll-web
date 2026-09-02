import type { Role } from '../../../prisma/generated/client';

/**
 * Fields that are safe to expose for a User. `passwordHash` is never selected
 * so no user-management handler can accidentally leak a credential hash.
 */
export const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  businessId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type SafeUser = {
  id: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  businessId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Roles a tenant-scoped user (ADMIN/SUPER_ADMIN) is allowed to assign. */
export const manageableRoles: readonly Role[] = ['ADMIN', 'PAYROLL_OPERATOR', 'VIEWER'];

export function isManageableRole(role: Role): boolean {
  return (manageableRoles as readonly Role[]).includes(role);
}

/** Prevents an admin from locking themselves out or escalating their own role. */
export function isSelfMutation(actorId: string, targetId: string): boolean {
  return actorId === targetId;
}