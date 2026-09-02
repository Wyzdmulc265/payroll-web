import { NextResponse } from 'next/server';
import type { Role } from '../../../prisma/generated/client';
import type { AuthUser } from './types';
import { hasPermission, type Permission } from './permissions';

export function unauthorized(): NextResponse {
  return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
}

export function forbidden(): NextResponse {
  return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
}

export function canAccessBusiness(user: AuthUser, businessId: string | null | undefined): boolean {
  return user.role === 'SUPER_ADMIN' ? false : Boolean(user.businessId && user.businessId === businessId);
}

export function requirePermission(user: AuthUser, permission: Permission): NextResponse | null {
  return hasPermission(user.role, permission) ? null : forbidden();
}

export function requireRole(user: AuthUser, roles: readonly Role[]): NextResponse | null {
  return roles.includes(user.role) ? null : forbidden();
}
