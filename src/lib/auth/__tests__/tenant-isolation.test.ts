import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getEmployees } from '@/app/api/employees/route';
import { POST as postEmployees } from '@/app/api/employees/route';
import { GET as getReport } from '@/app/api/reports/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

function makeRequest(url: string, cookie?: string, body?: unknown): NextRequest {
  const init: RequestInit = body !== undefined ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {};
  const request = new Request(url, init);
  if (cookie) request.headers.set('cookie', cookie);
  return new NextRequest(request);
}

function sessionCookie(token: string): string {
  return `__Host-payroll_session=${token}`;
}

describe('tenant isolation', () => {
  let businessA: { id: string };
  let businessB: { id: string };
  let tokenA: string;
  let tokenViewer: string;
  let tokenSuper: string;

   beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();
    await prisma.employee.deleteMany();

    const bizA = await prisma.business.create({ data: { name: 'Business A' } });
    const bizB = await prisma.business.create({ data: { name: 'Business B' } });
    businessA = bizA;
    businessB = bizB;

    const adminAHash = await bcrypt.hash('AdminA123', 10);
    const viewerHash = await bcrypt.hash('ViewerA123', 10);
    const superHash = await bcrypt.hash('SuperTest123', 10);

    const userA = await prisma.user.create({
      data: { email: 'admin-a@test.com', passwordHash: adminAHash, role: 'ADMIN', status: 'ACTIVE', businessId: bizA.id },
    });
    const viewerA = await prisma.user.create({
      data: { email: 'viewer-a@test.com', passwordHash: viewerHash, role: 'VIEWER', status: 'ACTIVE', businessId: bizA.id },
    });
    const superUser = await prisma.user.create({
      data: { email: 'super@test.com', passwordHash: superHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });

    const plainA = 'token-a-' + Date.now();
    const plainViewer = 'token-viewer-' + Date.now();
    const plainSuper = 'token-super-' + Date.now();

    await prisma.session.create({ data: { userId: userA.id, tokenHash: createHash('sha256').update(plainA).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    await prisma.session.create({ data: { userId: viewerA.id, tokenHash: createHash('sha256').update(plainViewer).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    await prisma.session.create({ data: { userId: superUser.id, tokenHash: createHash('sha256').update(plainSuper).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });

    tokenA = plainA;
    tokenViewer = plainViewer;
    tokenSuper = plainSuper;
  }, 30000);

  it('prevents Business A admin from reading Business B employees', async () => {
    await prisma.employee.create({ data: { employeeId: 'EMPA01', firstName: 'A', lastName: 'User', businessId: businessA.id, department: 'IT', position: 'Dev', employmentDate: new Date(), basicSalary: 1000 } });
    await prisma.employee.create({ data: { employeeId: 'EMPB01', firstName: 'B', lastName: 'User', businessId: businessB.id, department: 'IT', position: 'Dev', employmentDate: new Date(), basicSalary: 1000 } });

    const req = makeRequest('http://localhost/api/employees', sessionCookie(tokenA));
    const res = await getEmployees(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.length).toBe(1);
    expect(json.data[0].businessId).toBe(businessA.id);
  }, 30000);

  it('allows Business A admin to create employees in their own business', async () => {
    const req = makeRequest('http://localhost/api/employees', sessionCookie(tokenA), { employeeId: 'EMP001', firstName: 'Test', lastName: 'User', department: 'IT', position: 'Dev', employmentDate: new Date().toISOString(), basicSalary: 1000 });
    const res = await postEmployees(req);
    expect(res.status).toBe(201);
  }, 30000);

  it('redacts sensitive employee fields from VIEWER list responses', async () => {
    await prisma.employee.create({
      data: {
        employeeId: 'EMP001', firstName: 'Test', lastName: 'User', businessId: businessA.id,
        department: 'IT', position: 'Dev', employmentDate: new Date(), basicSalary: 1000,
        nationalId: 'NATIONAL-123', accountNumber: 'BANK-123', bankName: 'Example Bank',
        taxNumber: 'TAX-123', notes: 'Confidential note',
      },
    });

    const res = await getEmployees(makeRequest('http://localhost/api/employees', sessionCookie(tokenViewer)));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data[0]).toMatchObject({
      nationalId: null,
      accountNumber: null,
      bankName: null,
      taxNumber: null,
      notes: null,
    });
  }, 30000);

  it('denies VIEWER access to bank payment reports', async () => {
    const res = await getReport(makeRequest(
      'http://localhost/api/reports?type=Bank%20Payment%20Schedule&period=2026-08',
      sessionCookie(tokenViewer),
    ));
    expect(res.status).toBe(403);
  }, 30000);

  it('returns 403 for SUPER_ADMIN hitting business-scoped routes without business context', async () => {
    const req = makeRequest('http://localhost/api/employees', sessionCookie(tokenSuper));
    const res = await getEmployees(req);
    expect(res.status).toBe(403);
  }, 30000);
});
