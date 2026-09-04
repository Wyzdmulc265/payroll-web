import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  requirePermission,
  Permission,
} from '@/lib/auth';
import {
  buildAuditLogQuery,
  AuditAction,
  AuditEntity,
  getRequestIp,
  type AuditLogDto,
} from '@/lib/audit';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const auditActionSchema = z.enum(Object.values(AuditAction) as [string, ...string[]]);
const auditEntitySchema = z.enum(Object.values(AuditEntity) as [string, ...string[]]);

const querySchema = z.object({
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  action: auditActionSchema.optional().nullable(),
  entityType: auditEntitySchema.optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  businessId: z.string().optional().nullable(),
  query: z.string().trim().min(1).optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['timestamp', 'action']).default('timestamp'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();

    // ADMIN is business-scoped: the tenant comes from the session only.
    // SUPER_ADMIN has READ_AUDIT_LOGS (granted explicitly) and no session
    // business, so it sees all rows; an optional `?businessId=` query filter
    // lets it narrow to a single business.
    const denied = requirePermission(session.user, Permission.READ_AUDIT_LOGS);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const parseResult = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parseResult.error.errors },
        { status: 400 }
      );
    }
    const filters = parseResult.data;

    const isSuperAdmin = session.user.role === 'SUPER_ADMIN';
    const businessId = isSuperAdmin ? (filters.businessId ?? null) : session.user.businessId;
    if (!businessId && !isSuperAdmin) return forbidden();

    // Default to the last 30 days; clamp the end to now and reject inverted ranges.
    const now = new Date();
    const end = filters.endDate ? new Date(filters.endDate) : now;
    if (end > now) end.setTime(now.getTime());
    const defaultStart = new Date(now.getTime() - THIRTY_DAYS_MS);
    const start = filters.startDate ? new Date(filters.startDate) : defaultStart;
    if (start > end) {
      return NextResponse.json(
        { success: false, error: 'startDate must be before endDate' },
        { status: 400 }
      );
    }

    const { where, orderBy, skip, take } = buildAuditLogQuery(
      {
        businessId,
        startDate: start,
        endDate: end,
        action: filters.action ?? null,
        entityType: filters.entityType ?? null,
        entityId: filters.entityId ?? null,
        userId: filters.userId ?? null,
        employeeId: filters.employeeId ?? null,
        query: filters.query ?? null,
      },
      { page: filters.page, limit: filters.limit },
      { field: filters.sort, direction: filters.direction }
    );

    const [rows, total] = await prisma.$transaction(async (tx) => {
      const list = await tx.auditLog.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          timestamp: true,
          action: true,
          entityType: true,
          entityId: true,
          description: true,
          oldValue: true,
          newValue: true,
          ipAddress: true,
          user: { select: { id: true, email: true, role: true } },
          business: { select: { id: true, name: true } },
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
      });
      const count = await tx.auditLog.count({ where });
      return [list, count];
    });

    const page = filters.page;
    const limit = filters.limit;

    const dto = rows.map(
      (r): AuditLogDto => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        description: r.description,
        oldValue: r.oldValue,
        newValue: r.newValue,
        ipAddress: r.ipAddress,
        user: r.user ? { id: r.user.id, email: r.user.email, role: r.user.role } : null,
        business: r.business ? { id: r.business.id, name: r.business.name } : null,
        employee: r.employee
          ? {
              id: r.employee.id,
              employeeId: r.employee.employeeId,
              firstName: r.employee.firstName,
              lastName: r.employee.lastName,
            }
          : null,
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        auditLogs: dto,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        filters: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          action: filters.action ?? null,
          entityType: filters.entityType ?? null,
          query: filters.query ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    try {
      console.error('audit-logs request ip', getRequestIp(request));
    } catch {
      /* no-op */
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
