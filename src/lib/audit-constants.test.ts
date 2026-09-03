/**
 * Audit registry + query-builder tests, including the Phase 8 "10k+ row
 * performance test". The perf test exercises the pure builder over 10,000
 * generated filter combinations and asserts the generated where clauses stay
 * aligned with the `(businessId, timestamp)` composite index in
 * `prisma/schema.prisma` — i.e. every query pins `businessId` equality and,
 * when a date range is present, narrows on `timestamp` (gte/lte), which is
 * the access path Postgres will use for business-scoped, time-ranged scans.
 *
 * DB-free by design: `audit-constants` imports Prisma types only.
 */
import { describe, it, expect } from 'vitest';
import {
  AuditAction,
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_OPTIONS,
  AuditLogFilters,
  buildAuditLogQuery,
} from './audit-constants';

describe('audit registry (Phase 8 coverage)', () => {
  it('declares every Phase 8 auth event', () => {
    for (const action of [
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'FORGOT_PASSWORD_REQUESTED',
      'PASSWORD_CHANGED',
    ]) {
      expect(AUDIT_ACTION_OPTIONS).toContain(action);
    }
  });

  it('declares every Phase 8 business event', () => {
    for (const action of [
      'USER_CREATED',
      'USER_UPDATED',
      'USER_DEACTIVATED',
      'EMPLOYEE_CREATED',
      'EMPLOYEE_UPDATED',
      'EMPLOYEE_DEACTIVATED',
      'PAYROLL_CALCULATED',
      'PAYROLL_SAVED',
      'SETTINGS_CREATED',
      'SETTINGS_UPDATED',
      'SETTINGS_DELETED',
      'REPORT_EXPORTED',
    ]) {
      expect(AUDIT_ACTION_OPTIONS).toContain(action);
    }
  });

  it('keeps action values unique and entity options non-empty', () => {
    expect(new Set(AUDIT_ACTION_OPTIONS).size).toBe(AUDIT_ACTION_OPTIONS.length);
    expect(AUDIT_ENTITY_OPTIONS.length).toBeGreaterThan(0);
  });
});

describe('buildAuditLogQuery', () => {
  const base: AuditLogFilters = { businessId: 'biz_1' };

  it('pins businessId and orders newest-first', () => {
    const q = buildAuditLogQuery(base, { page: 1, limit: 50 });
    expect(q.where.businessId).toBe('biz_1');
    expect(q.orderBy).toEqual({ timestamp: 'desc' });
    expect(q.skip).toBe(0);
    expect(q.take).toBe(50);
  });

  it('narrow on timestamp with a date range (index-aligned)', () => {
    const q = buildAuditLogQuery(
      {
        ...base,
        startDate: new Date('2026-08-01T00:00:00Z'),
        endDate: new Date('2026-08-31T23:59:59Z'),
      },
      { page: 1, limit: 50 }
    );
    const ts = q.where.timestamp as { gte?: Date; lte?: Date };
    expect(ts.gte).toEqual(new Date('2026-08-01T00:00:00Z'));
    expect(ts.lte).toEqual(new Date('2026-08-31T23:59:59Z'));
  });

  it('applies action, entity, and entity-id equality filters', () => {
    const q = buildAuditLogQuery(
      { ...base, action: AuditAction.REPORT_EXPORTED, entityType: 'Report', entityId: '2026-08' },
      { page: 1, limit: 50 }
    );
    expect(q.where.action).toEqual({ equals: 'REPORT_EXPORTED' });
    expect(q.where.entityType).toEqual({ equals: 'Report' });
    expect(q.where.entityId).toEqual({ equals: '2026-08' });
  });

  it('maps free-text query to OR contains across description/action/entityType', () => {
    const q = buildAuditLogQuery({ ...base, query: 'payslip' }, { page: 1, limit: 50 });
    const or = q.where.OR as Array<Record<string, { contains: string; mode?: string }>>;
    expect(or).toHaveLength(3);
    for (const clause of or) {
      const field = Object.keys(clause)[0];
      expect(['description', 'action', 'entityType']).toContain(field);
      expect(clause[field].contains).toBe('payslip');
    }
  });

  it('clamps pagination to safe bounds', () => {
    const low = buildAuditLogQuery(base, { page: -5, limit: 10000 });
    expect(low.skip).toBeGreaterThanOrEqual(0);
    expect(low.take).toBeLessThanOrEqual(200);
    const high = buildAuditLogQuery(base, { page: 99, limit: 50 });
    expect(high.skip).toBe(98 * 50);
  });
});

describe('10k-row performance test (Phase 8)', () => {
  const N = 10_000;

  it('builds 10,000 varied queries well under budget and stays index-aligned', () => {
    const start = performance.now();

    let violations = 0;
    for (let i = 0; i < N; i++) {
      // Deterministic pseudo-random filters spanning the viewer's surface.
      const day = i % 30;
      const filters: AuditLogFilters = {
        businessId: `biz_${i % 7}`,
        startDate: new Date(Date.UTC(2026, 7, day + 1)),
        endDate: new Date(Date.UTC(2026, 7, day + 1, 23, 59, 59)),
        action: i % 3 === 0 ? AuditAction.LOGIN_SUCCESS : undefined,
        entityType: i % 4 === 0 ? 'Employee' : undefined,
        userId: i % 5 === 0 ? `user_${i % 100}` : undefined,
        query: i % 6 === 0 ? 'payroll' : undefined,
      };
      const q = buildAuditLogQuery(filters, { page: (i % 20) + 1, limit: 50 });

      // Lightweight invariant checks (no expect() per iteration):
      // businessId equality is always pinned, and a timestamp range is
      // always present when dates are supplied — matching the
      // @@index([businessId, timestamp]) access path.
      if (q.where.businessId !== filters.businessId) violations++;
      if (!q.where.timestamp) violations++;
      const ts = q.where.timestamp as { gte?: Date; lte?: Date } | undefined;
      if (!ts?.gte || !ts?.lte) violations++;
      if (q.take !== 50) violations++;
    }

    const elapsedMs = performance.now() - start;
    // Budget: 10k builds in <2s (typical run: tens of ms). Guards against
    // accidental O(n²) or per-call allocations blowing up under load.
    expect(elapsedMs).toBeLessThan(2000);
    // Index alignment invariants must hold for all 10k queries.
    expect(violations).toBe(0);
  });
});
