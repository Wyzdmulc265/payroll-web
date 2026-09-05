import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getEmployees, POST as postEmployees } from '@/app/api/employees/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

function makeRequest(url: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, { headers });
}

function sessionCookie(token: string): string {
  return `__Host-payroll_session=${token}`;
}

describe('route protection', () => {
  let adminToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();
    await prisma.employee.deleteMany();

    const biz = await prisma.business.create({ data: { name: 'Route Test Business' } });

    const adminHash = await bcrypt.hash('AdminTest123', 10);
    const viewerHash = await bcrypt.hash('ViewerTest123', 10);

    const admin = await prisma.user.create({
      data: { email: 'admin-route@test.com', passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE', businessId: biz.id },
    });
    const viewer = await prisma.user.create({
      data: { email: 'viewer-route@test.com', passwordHash: viewerHash, role: 'VIEWER', status: 'ACTIVE', businessId: biz.id },
    });

    const adminPlain = 'admin-token-' + Date.now();
    const viewerPlain = 'viewer-token-' + Date.now();

    await prisma.session.create({
      data: { userId: admin.id, tokenHash: createHash('sha256').update(adminPlain).digest('hex'), expiresAt: new Date(Date.now() + 86400000) },
    });
    await prisma.session.create({
      data: { userId: viewer.id, tokenHash: createHash('sha256').update(viewerPlain).digest('hex'), expiresAt: new Date(Date.now() + 86400000) },
    });

    adminToken = adminPlain;
    viewerToken = viewerPlain;
  }, 30000);

  it('returns 401 when no session cookie is present', async () => {
    const req = makeRequest('http://localhost/api/employees');
    const res = await getEmployees(req);
    expect(res.status).toBe(401);
  }, 30000);

  it('returns 401 for an invalid session token', async () => {
    const req = makeRequest('http://localhost/api/employees', sessionCookie('invalid-token'));
    const res = await getEmployees(req);
    expect(res.status).toBe(401);
  }, 30000);

  it('returns 403 when a VIEWER hits a mutating endpoint', async () => {
    const req = makeRequest('http://localhost/api/employees', sessionCookie(viewerToken));
    const res = await postEmployees(req);
    expect(res.status).toBe(403);
  }, 30000);

  it('returns 200 when an ADMIN hits a read endpoint', async () => {
    const req = makeRequest('http://localhost/api/employees', sessionCookie(adminToken));
    const res = await getEmployees(req);
    expect(res.status).toBe(200);
  }, 30000);
});
