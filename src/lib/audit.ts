import type { Prisma } from '../../prisma/generated/client';
import prisma from './prisma';
import type { NextRequest } from 'next/server';

// Audit registries, viewer filter types, DTO, and the pure query builder live
// in `audit-constants` (type-only Prisma import) so they can be imported by
// server routes and client components alike without pulling `@prisma/client`
// into the browser bundle or into DB-less tests. This module adds the
// write-side `logAuditEvent`, the only place that touches the Prisma client.
export * from './audit-constants';

export function getRequestIp(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip');
}

export type AuditEvent = {
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  businessId?: string | null;
  description: string;
  previousData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
};

function serialize(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

export async function logAuditEvent(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
  const data: Prisma.AuditLogCreateInput = {
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    description: event.description,
    oldValue: serialize(event.previousData),
    newValue: serialize(event.newData),
    ipAddress: event.ipAddress ?? null,
    ...(event.userId ? { user: { connect: { id: event.userId } } } : {}),
    ...(event.businessId ? { business: { connect: { id: event.businessId } } } : {}),
  };

  const client = tx ?? prisma;
  try {
    await client.auditLog.create({ data });
  } catch (error) {
    console.error('Audit log write failed:', error);
    // When part of a transaction, throw the error to abort it
    if (tx) throw error;
  }
}
