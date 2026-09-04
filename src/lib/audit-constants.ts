/**
 * Pure, I/O-free audit registry, filter types, and query builder.
 *
 * This module imports `Prisma` as a **type only** (`import type`), so it is
 * safe to import from both server routes and **client** components without
 * pulling `@prisma/client`'s runtime (which requires `DATABASE_URL`) into the
 * browser bundle or into tests that have no database.
 *
 * `src/lib/audit.ts` re-exports everything here and adds the write-side
 * `logAuditEvent`, which is the only place that touches the Prisma client.
 * Add a new audited action here only.
 */
import type { Prisma } from '../../prisma/generated/client';

export const AuditAction = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  FORGOT_PASSWORD_REQUESTED: 'FORGOT_PASSWORD_REQUESTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ACCOUNT_UPDATED: 'ACCOUNT_UPDATED',

  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',

  EMPLOYEE_CREATED: 'EMPLOYEE_CREATED',
  EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
  EMPLOYEE_DEACTIVATED: 'EMPLOYEE_DEACTIVATED',

  PAYROLL_CALCULATED: 'PAYROLL_CALCULATED',
  PAYROLL_SAVED: 'PAYROLL_SAVED',

  SETTINGS_CREATED: 'SETTINGS_CREATED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  SETTINGS_DELETED: 'SETTINGS_DELETED',

  PAYSLIP_GENERATED: 'PAYSLIP_GENERATED',
  REPORT_EXPORTED: 'REPORT_EXPORTED',

  BUSINESS_CREATED: 'BUSINESS_CREATED',
  BUSINESS_UPDATED: 'BUSINESS_UPDATED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AUDIT_ACTION_OPTIONS: readonly AuditAction[] =
  Object.values(AuditAction) as readonly AuditAction[];

export const AuditEntity = {
  Auth: 'Auth',
  User: 'User',
  Employee: 'Employee',
  Payroll: 'Payroll',
  Settings: 'Settings',
  Payslip: 'Payslip',
  Report: 'Report',
  Business: 'Business',
} as const;

export type AuditEntity = (typeof AuditEntity)[keyof typeof AuditEntity];

export const AUDIT_ENTITY_OPTIONS: readonly AuditEntity[] =
  Object.values(AuditEntity) as readonly AuditEntity[];

/**
 * Read-side filters for the audit-log viewer. `businessId` defaults to the
 * authenticated session's business for tenant-scoped roles (ADMIN). For
 * SUPER_ADMIN — who has no `businessId` — it is optional and, when omitted,
 * yields a cross-business view; when supplied, it scopes results to that
 * business. Callers cannot supply a business ID that overrides tenant scope
 * unless they are SUPER_ADMIN.
 */
export type AuditLogFilters = {
  businessId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
  employeeId?: string | null;
  query?: string | null;
};

export type AuditLogPagination = {
  page: number;
  limit: number;
};

export type AuditLogSort = {
  field?: string;
  direction?: 'asc' | 'desc';
};

export type AuditLogQuery = {
  where: Prisma.AuditLogWhereInput;
  orderBy: Prisma.AuditLogOrderByWithRelationInput;
  skip: number;
  take: number;
};

/**
 * Safe DTO projection for an `AuditLog` row. There is no secret material on
 * the row itself, but this keeps the viewer's output contract explicit and
 * resolves the optional `user`, `business`, and `employee` relations to a
 * small, safe surface.
 */
export type AuditLogDto = {
  id: string;
  // ISO-8601 string, not Date: the DTO crosses the JSON transport boundary,
  // which serializes Date to string. Serializing explicitly at the API edge
  // keeps this contract honest so clients never call Date methods on it.
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  user: { id: string; email: string; role: string } | null;
  business: { id: string; name: string } | null;
  employee: { id: string; employeeId: string; firstName: string | null; lastName: string | null } | null;
};

/**
 * Build a Prisma `AuditLog` query from viewer filters.
 *
 * For tenant-scoped roles (ADMIN), `businessId` is always pinned to the
 * session's business — exactly what the composite `(businessId, timestamp)`
 * index on `AuditLog` is designed for. For SUPER_ADMIN, `businessId` is
 * optional: when supplied, it scopes results to one business; when omitted,
 * the query spans all businesses. When a date range is supplied, a `timestamp`
 * range narrows the scan. Sorting is restricted to `timestamp` (the indexed
 * column) so the planner can satisfy both the filter and the ordering from a
 * single index scan.
 *
 * This function is pure and is covered by unit tests (no database needed).
 */
export function buildAuditLogQuery(
  filters: AuditLogFilters,
  pagination: AuditLogPagination,
  sort: AuditLogSort = {}
): AuditLogQuery {
  const { businessId, startDate, endDate, action, entityType, entityId, userId, employeeId, query } = filters;

  const where: Prisma.AuditLogWhereInput = {};
  if (businessId) where.businessId = businessId;

  const dateRange: { gte?: Date; lte?: Date } = {};
  if (startDate) dateRange.gte = startDate;
  if (endDate) dateRange.lte = endDate;
  if (dateRange.gte || dateRange.lte) where.timestamp = dateRange;

  if (action) where.action = { equals: action };
  if (entityType) where.entityType = { equals: entityType };
  if (entityId) where.entityId = { equals: entityId };
  if (userId) where.userId = { equals: userId };
  if (employeeId) where.employeeId = { equals: employeeId };

  if (query) {
    const q = query;
    where.OR = [
      { action: { contains: q, mode: 'insensitive' } },
      { entityType: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Only `timestamp` (and `action`) are useful sort keys; default to
  // newest-first. Any unknown field falls back to `timestamp desc`.
  const field = sort.field === 'timestamp' || sort.field === 'action' ? sort.field : 'timestamp';
  const direction = sort.direction === 'asc' || sort.direction === 'desc' ? sort.direction : 'desc';

  const orderBy: Prisma.AuditLogOrderByWithRelationInput = { [field]: direction };

  const page = Math.max(1, pagination.page ?? 1);
  const limit = Math.max(1, Math.min(200, pagination.limit ?? 50));
  const skip = (page - 1) * limit;

  return { where, orderBy, skip, take: limit };
}
