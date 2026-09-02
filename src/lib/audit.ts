import type { Prisma } from '../../prisma/generated/client';
import prisma from './prisma';
import type { NextRequest } from 'next/server';

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

export async function logAuditEvent(event: AuditEvent): Promise<void> {
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

  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}
