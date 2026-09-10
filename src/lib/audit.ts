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
/**
 * Fields on an Employee record that must NEVER be written into
 * `AuditLog.oldValue`/`newValue`. The audit table stores JSON as text and
 * is readable by anyone with DB access, so it must not contain plaintext
 * PII (national ID, bank account, tax number) or other confidential data
 * (salary figures, notes, banking details).
 *
 * The PII triple is excluded because some call sites pass the *decrypted*
 * or *pretransformation* record; the salary/notes/bank fields are excluded
 * because salaries are confidential and `notes` is free-form.
 */
const EMPLOYEE_AUDIT_REDACTED_FIELDS = [
  'basicSalary', 'allowances', 'nationalId', 'nationalIdHash', 'accountNumber',
  'taxNumber', 'bankName', 'notes',
] as const;
/**
 * Return a minimal, non-confidential projection of an Employee record for
 * the audit trail. Kept deliberately allow-list rather than deny-list so a
 * newly added confidential field is dropped by default until explicitly
 * whitelisted.
 */
export function redactEmployeeForAudit<T extends Record<string, unknown>>(
  employee: T,
): Record<string, unknown> {
  const allow = [
    'id', 'employeeId', 'businessId', 'firstName', 'lastName', 'fullName',
    'department', 'position', 'employmentDate', 'employmentType',
    'employmentStatus', 'salaryFrequency', 'paymentMethod',
    'pensionApplicable', 'taxStatus', 'isActive', 'createdAt', 'updatedAt',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (key in employee) out[key] = employee[key];
  }
  // Belt-and-suspenders: never emit a redacted field even if it somehow
  // enters the allow list by accident.
  for (const key of EMPLOYEE_AUDIT_REDACTED_FIELDS) {
    delete out[key];
  }
  return out;
}
/**
 * Redact a full `Settings` row for the audit trail, dropping only the raw
 * `value` (which may hold statutory rates or other sensitive config) while
 * preserving enough metadata to answer "when was this key changed".
 */
export function redactSettingsForAudit<T extends Record<string, unknown>>(
  setting: T,
): Record<string, unknown> {
  const { value: _value, ...rest } = setting;
  return rest;
}

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
