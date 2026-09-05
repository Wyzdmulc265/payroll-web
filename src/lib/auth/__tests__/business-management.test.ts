import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getBusinesses, POST as postBusinesses } from '@/app/api/businesses/route';
import { GET as getBusiness, PUT as putBusiness } from '@/app/api/businesses/[id]/route';
import { GET as getEmployees, POST as postEmployees } from '@/app/api/employees/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

function makeRequest(url: string, cookie?: string, method = 'GET', body?: unknown): NextRequest {
  const init: RequestInit =
    body !== undefined
      ? { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : { method };
  const request = new Request(url, init);
  if (cookie) request.headers.set('cookie', cookie);
  return new NextRequest(request);
}

function sessionCookie(token: string): string {
  return `__Host-payroll_session=${token}`;
}

let tokenCounter = 0;
async function loginAs(userId: string): Promise<string> {
  const plain = `tok-${userId}-${Date.now()}-${tokenCounter++}`;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(plain).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return plain;
}

async function routeContext(id: string) {
  return { params: Promise.resolve({ id }) } as unknown as { params: Promise<{ id: string }> };
}

describe('business management (Phase 9)', () => {
  let tokenSuper: string;
  let tokenAdminA: string;

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

    const bizA = await prisma.business.create({ data: { name: 'Biz A' } });
    const adminAHash = await bcrypt.hash('AdminA123', 10);
    const superHash = await bcrypt.hash('SuperTest123', 10);

    const userA = await prisma.user.create({
      data: { email: 'admin-a@test.com', passwordHash: adminAHash, role: 'ADMIN', status: 'ACTIVE', businessId: bizA.id },
    });
    const superUser = await prisma.user.create({
      data: { email: 'super@test.com', passwordHash: superHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });

    tokenAdminA = await loginAs(userA.id);
    tokenSuper = await loginAs(superUser.id);
  }, 30000);

  it('GET /api/businesses lists businesses with user and employee counts for SUPER_ADMIN', async () => {
    const res = await getBusinesses(makeRequest('http://localhost/api/businesses', sessionCookie(tokenSuper)));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(1);
    expect(json.data[0].name).toBe('Biz A');
    expect(json.data[0]._count.users).toBe(1);
    expect(json.data[0]._count.employees).toBe(0);
  }, 30000);

  it('GET /api/businesses is denied to ADMIN (MANAGE_BUSINESSES is SUPER_ADMIN-only)', async () => {
    const res = await getBusinesses(makeRequest('http://localhost/api/businesses', sessionCookie(tokenAdminA)));
    expect(res.status).toBe(403);
  }, 30000);

  it('POST /api/businesses creates a business, audit event, and initial ADMIN in one transaction', async () => {
    const req = makeRequest('http://localhost/api/businesses', sessionCookie(tokenSuper), 'POST', {
      name: 'New Biz',
      initialAdmin: { email: 'founder@newbiz.com', password: 'Founder123' },
    });
    const res = await postBusinesses(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    const admin = await prisma.user.findFirst({ where: { email: 'founder@newbiz.com' } });
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('ADMIN');
    expect(admin!.businessId).toBe(json.data.id);
    expect(admin!.passwordHash).not.toBe('Founder123');

    const events = await prisma.auditLog.findMany({ where: { businessId: json.data.id }, orderBy: { timestamp: 'asc' } });
    const actions = events.map((e) => e.action);
    expect(actions).toContain('BUSINESS_CREATED');
    expect(actions).toContain('USER_CREATED');
  }, 30000);

  it('POST /api/businesses allows an initial-admin email that exists in another business', async () => {
    // Email is unique per business (User @@unique([email, businessId])), so
    // reusing admin-a@test.com for a new business is legitimate: both
    // accounts coexist, each scoped to its own business.
    const req = makeRequest('http://localhost/api/businesses', sessionCookie(tokenSuper), 'POST', {
      name: 'Dup Biz',
      initialAdmin: { email: 'admin-a@test.com', password: 'Founder123' },
    });
    const res = await postBusinesses(req);
    const json = await res.json();
    expect(res.status).toBe(201);

    const admins = await prisma.user.findMany({ where: { email: 'admin-a@test.com' } });
    expect(admins).toHaveLength(2);
    const businessIds = admins.map((a) => a.businessId);
    expect(businessIds).toContain(json.data.id);
    expect(new Set(businessIds).size).toBe(2);
    expect(json.initialAdmin.email).toBe('admin-a@test.com');
  }, 30000);

  it('PUT /api/businesses/[id] updates name and writes a BUSINESS_UPDATED audit event', async () => {
    const biz = await prisma.business.create({ data: { name: 'Old Name' } });
    const req = makeRequest(`http://localhost/api/businesses/${biz.id}`, sessionCookie(tokenSuper), 'PUT', { name: 'New Name' });
    const res = await putBusiness(req, await routeContext(biz.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.name).toBe('New Name');

    const event = await prisma.auditLog.findFirst({ where: { businessId: biz.id, action: 'BUSINESS_UPDATED' } });
    expect(event).not.toBeNull();
    expect(JSON.parse(event!.oldValue!)).toMatchObject({ name: 'Old Name' });
    expect(JSON.parse(event!.newValue!)).toMatchObject({ name: 'New Name' });
  }, 30000);

  it('PUT status=INACTIVE deletes all sessions of the business users but keeps users ACTIVE', async () => {
    const biz = await prisma.business.create({ data: { name: 'To Deactivate' } });
    const user = await prisma.user.create({
      data: { email: 'op@deact.com', passwordHash: await bcrypt.hash('OpPass123', 10), role: 'ADMIN', status: 'ACTIVE', businessId: biz.id },
    });
    await loginAs(user.id);

    const req = makeRequest(`http://localhost/api/businesses/${biz.id}`, sessionCookie(tokenSuper), 'PUT', { status: 'INACTIVE' });
    const res = await putBusiness(req, await routeContext(biz.id));
    expect(res.status).toBe(200);

    const sessions = await prisma.session.count({ where: { userId: user.id } });
    expect(sessions).toBe(0);
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.status).toBe('ACTIVE');
  }, 30000);

  it('SUPER_ADMIN still cannot read business-scoped payroll resources (no implicit access)', async () => {
    const biz = await prisma.business.create({ data: { name: 'Sandbox' } });
    await prisma.employee.create({
      data: { employeeId: 'SB01', firstName: 'S', lastName: 'B', businessId: biz.id, department: 'IT', position: 'Dev', employmentDate: new Date(), basicSalary: 1000 },
    });

    const readRes = await getEmployees(makeRequest('http://localhost/api/employees', sessionCookie(tokenSuper)));
    expect(readRes.status).toBe(403);

    const writeRes = await postEmployees(
      makeRequest('http://localhost/api/employees', sessionCookie(tokenSuper), 'POST', {
        employeeId: 'SB02', firstName: 'S', lastName: 'B', department: 'IT', position: 'Dev',
        employmentDate: new Date().toISOString(), basicSalary: 1000,
      })
    );
    expect(writeRes.status).toBe(403);
  }, 30000);

  it('GET /api/businesses/[id] returns 404 for unknown id and includes payroll count', async () => {
    const biz = await prisma.business.create({ data: { name: 'Counted' } });
    const res = await getBusiness(
      makeRequest(`http://localhost/api/businesses/${biz.id}`, sessionCookie(tokenSuper)),
      await routeContext(biz.id)
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data._count).toHaveProperty('payrollRecords');

    const missing = await getBusiness(
      makeRequest('http://localhost/api/businesses/nope', sessionCookie(tokenSuper)),
      await routeContext('nope')
    );
    expect(missing.status).toBe(404);
  }, 30000);
});

