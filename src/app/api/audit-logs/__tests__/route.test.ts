import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAuditLogs } from '@/app/api/audit-logs/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

function makeRequest(url: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, { headers });
}

function sessionCookie(token: string): string {
  return `payroll_session=${token}`;
}

async function loginAs(userId: string): Promise<string> {
  const plain = `tok-${userId}-${Date.now()}-${Math.random()}`;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(plain).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return plain;
}

describe('audit-logs route (cross-business for SUPER_ADMIN)', () => {
  let bizA: { id: string; name: string };
  let bizB: { id: string; name: string };
  let tokenAdminA: string;
  let tokenSuper: string;
  let tokenViewer: string;

  beforeEach(async () => {
    await prisma.fringeBenefit.deleteMany();
    await prisma.payrollRecord.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.settings.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    bizA = await prisma.business.create({ data: { name: 'Audit Biz A' } });
    bizB = await prisma.business.create({ data: { name: 'Audit Biz B' } });

    const adminAHash = await bcrypt.hash('AdminA123', 10);
    const adminBHash = await bcrypt.hash('AdminB123', 10);
    const superHash = await bcrypt.hash('SuperTest123', 10);
    const viewerHash = await bcrypt.hash('ViewerTest123', 10);

    const adminA = await prisma.user.create({
      data: { email: 'admin-a-audit@test.com', passwordHash: adminAHash, role: 'ADMIN', status: 'ACTIVE', businessId: bizA.id },
    });
    const adminB = await prisma.user.create({
      data: { email: 'admin-b-audit@test.com', passwordHash: adminBHash, role: 'ADMIN', status: 'ACTIVE', businessId: bizB.id },
    });
    const superUser = await prisma.user.create({
      data: { email: 'super-audit@test.com', passwordHash: superHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
    const viewer = await prisma.user.create({
      data: { email: 'viewer-audit@test.com', passwordHash: viewerHash, role: 'VIEWER', status: 'ACTIVE', businessId: bizA.id },
    });

    await prisma.auditLog.createMany({
      data: [
        { action: 'EMPLOYEE_CREATED', entityType: 'Employee', description: 'Biz A event', userId: adminA.id, businessId: bizA.id },
        { action: 'EMPLOYEE_CREATED', entityType: 'Employee', description: 'Biz B event', userId: adminB.id, businessId: bizB.id },
      ],
    });

    tokenAdminA = await loginAs(adminA.id);
    await loginAs(adminB.id);
    tokenSuper = await loginAs(superUser.id);
    tokenViewer = await loginAs(viewer.id);
  }, 30000);

  it('ADMIN is scoped to their own business', async () => {
    const res = await getAuditLogs(
      makeRequest('http://localhost/api/audit-logs?startDate=2020-01-01&endDate=2099-01-01', sessionCookie(tokenAdminA))
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const descriptions = json.data.auditLogs.map((l: { description: string }) => l.description);
    expect(descriptions).toContain('Biz A event');
    expect(descriptions).not.toContain('Biz B event');
  }, 30000);

  it('SUPER_ADMIN sees cross-business rows', async () => {
    const res = await getAuditLogs(
      makeRequest('http://localhost/api/audit-logs?startDate=2020-01-01&endDate=2099-01-01', sessionCookie(tokenSuper))
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const descriptions = json.data.auditLogs.map((l: { description: string }) => l.description);
    expect(descriptions).toContain('Biz A event');
    expect(descriptions).toContain('Biz B event');
  }, 30000);

  it('SUPER_ADMIN can filter by businessId', async () => {
    const res = await getAuditLogs(
      makeRequest(`http://localhost/api/audit-logs?startDate=2020-01-01&endDate=2099-01-01&businessId=${bizB.id}`, sessionCookie(tokenSuper))
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const descriptions = json.data.auditLogs.map((l: { description: string }) => l.description);
    expect(descriptions).toContain('Biz B event');
    expect(descriptions).not.toContain('Biz A event');
  }, 30000);

  it('VIEWER is denied (no READ_AUDIT_LOGS)', async () => {
    const res = await getAuditLogs(
      makeRequest('http://localhost/api/audit-logs?startDate=2020-01-01&endDate=2099-01-01', sessionCookie(tokenViewer))
    );
    expect(res.status).toBe(403);
  }, 30000);

  it('returns 401 without a session', async () => {
    const res = await getAuditLogs(
      makeRequest('http://localhost/api/audit-logs?startDate=2020-01-01&endDate=2099-01-01')
    );
    expect(res.status).toBe(401);
  }, 30000);
});
