import { describe, expect, it, beforeEach, vi } from 'vitest';

// Integration tests hit a live Neon database whose cold starts and network
// round-trips routinely exceed Vitest's 5s default timeout. Raise it for the
// whole suite so the occasional cold start does not flake.
vi.setConfig({ testTimeout: 90000 });

import { NextRequest } from 'next/server';
import { GET as listUsers, POST as createUser } from '@/app/api/users/route';
import { GET as getUser, PUT as updateUser, DELETE as deactivateUser } from '@/app/api/users/[id]/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

function makeRequest(url: string, cookie?: string, body?: unknown): NextRequest {
  const init: RequestInit = body !== undefined
    ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
    : {};
  const request = new Request(url, init);
  if (cookie) request.headers.set('cookie', cookie);
  return new NextRequest(request);
}

function sessionCookie(token: string): string {
  return `payroll_session=${token}`;
}

async function createSession(userId: string, token: string): Promise<void> {
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
}

describe('user management', () => {
  let businessA: { id: string };
  let businessB: { id: string };
  let adminA: { id: string; email: string };
  let viewerA: { id: string };
  let superUser: { id: string };
  let adminToken: string;

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

    businessA = await prisma.business.create({ data: { name: 'Business A' } });
    businessB = await prisma.business.create({ data: { name: 'Business B' } });

    const hash = await bcrypt.hash('AdminTest123', 10);

    const a = await prisma.user.create({
      data: { email: 'admin-a@test.com', passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: businessA.id },
    });
    const v = await prisma.user.create({
      data: { email: 'viewer-a@test.com', passwordHash: hash, role: 'VIEWER', status: 'ACTIVE', businessId: businessA.id },
    });
    const s = await prisma.user.create({
      data: { email: 'super@test.com', passwordHash: hash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });

    adminA = { id: a.id, email: a.email };
    viewerA = { id: v.id };
    superUser = { id: s.id };

    const plain = 'admin-token-' + Date.now();
    await createSession(a.id, plain);
    adminToken = plain;
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await listUsers(makeRequest('http://localhost/api/users'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a VIEWER on the list endpoint', async () => {
    const vToken = 'viewer-token-' + Date.now();
    await createSession(viewerA.id, vToken);
    const res = await listUsers(makeRequest('http://localhost/api/users', sessionCookie(vToken)));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a VIEWER on create', async () => {
    const vToken = 'viewer-token-' + Date.now();
    await createSession(viewerA.id, vToken);
    const res = await createUser(makeRequest('http://localhost/api/users', sessionCookie(vToken), {
      email: 'new@test.com', password: 'NewPass123', role: 'ADMIN',
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for SUPER_ADMIN without an assigned business', async () => {
    const sToken = 'super-token-' + Date.now();
    await createSession(superUser.id, sToken);
    const res = await listUsers(makeRequest('http://localhost/api/users', sessionCookie(sToken)));
    expect(res.status).toBe(403);
  });

  it('lists only users in the same business (tenant isolation)', async () => {
    const hash = await bcrypt.hash('Pass123', 10);
    const userB = await prisma.user.create({
      data: { email: 'admin-b@test.com', passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: businessB.id },
    });

    const res = await listUsers(makeRequest('http://localhost/api/users', sessionCookie(adminToken)));
    const json = await res.json();
    expect(res.status).toBe(200);
    const emails = (json.data as { email: string }[]).map((u) => u.email);
    expect(emails).toContain(adminA.email);
    expect(emails).not.toContain(userB.email);
    expect(emails).not.toContain('super@test.com');
  });

  it('creates a user, hashes the password, and returns no passwordHash', async () => {
    const res = await createUser(makeRequest('http://localhost/api/users', sessionCookie(adminToken), {
      email: 'payroll@test.com', password: 'NewPass123', role: 'PAYROLL_OPERATOR',
    }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data.passwordHash).toBeUndefined();
    expect(json.data.email).toBe('payroll@test.com');
    expect(json.data.businessId).toBe(businessA.id);

    const stored = await prisma.user.findFirst({ where: { email: 'payroll@test.com' } });
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toBe('NewPass123');
    expect(await bcrypt.compare('NewPass123', stored!.passwordHash)).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_CREATED', entityId: stored!.id } });
    expect(audit).not.toBeNull();
    expect(audit!.businessId).toBe(businessA.id);
  });

  it('rejects duplicate email on create', async () => {
    const res = await createUser(makeRequest('http://localhost/api/users', sessionCookie(adminToken), {
      email: adminA.email, password: 'NewPass123', role: 'PAYROLL_OPERATOR',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects creating a SUPER_ADMIN', async () => {
    const res = await createUser(makeRequest('http://localhost/api/users', sessionCookie(adminToken), {
      email: 'evil@test.com', password: 'NewPass123', role: 'SUPER_ADMIN' as never,
    }));
    expect(res.status).toBe(400);

    const stored = await prisma.user.findFirst({ where: { email: 'evil@test.com' } });
    expect(stored).toBeNull();
  });

  it('gets a single user by id within the tenant', async () => {
    const res = await getUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken)), {
      params: Promise.resolve({ id: adminA.id }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.email).toBe(adminA.email);
    expect(json.data.passwordHash).toBeUndefined();
  });

  it('returns 404 when fetching a user from another business', async () => {
    const hash = await bcrypt.hash('Pass123', 10);
    const userB = await prisma.user.create({
      data: { email: 'admin-b@test.com', passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: businessB.id },
    });
    const res = await getUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken)), {
      params: Promise.resolve({ id: userB.id }),
    });
    expect(res.status).toBe(404);
  });

  it('updates a user role, email, and status', async () => {
    const hash = await bcrypt.hash('Pass123', 10);
    const target = await prisma.user.create({
      data: { email: 'target@test.com', passwordHash: hash, role: 'VIEWER', status: 'ACTIVE', businessId: businessA.id },
    });
    const res = await updateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken), {
      role: 'ADMIN', status: 'INACTIVE', email: 'target2@test.com',
    }), { params: Promise.resolve({ id: target.id }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.role).toBe('ADMIN');
    expect(json.data.status).toBe('INACTIVE');
    expect(json.data.email).toBe('target2@test.com');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_UPDATED', entityId: target.id } });
    expect(audit).not.toBeNull();
  });

  it('rejects setting a target role to SUPER_ADMIN on update', async () => {
    const hash = await bcrypt.hash('Pass123', 10);
    const target = await prisma.user.create({
      data: { email: 'target@test.com', passwordHash: hash, role: 'VIEWER', status: 'ACTIVE', businessId: businessA.id },
    });
    const res = await updateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken), {
      role: 'SUPER_ADMIN' as never,
    }), { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(400);

    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after!.role).toBe('VIEWER');
  });

  it('deactivates a user via DELETE (logical)', async () => {
    const hash = await bcrypt.hash('Pass123', 10);
    const target = await prisma.user.create({
      data: { email: 'target@test.com', passwordHash: hash, role: 'PAYROLL_OPERATOR', status: 'ACTIVE', businessId: businessA.id },
    });
    const res = await deactivateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken)), {
      params: Promise.resolve({ id: target.id }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('INACTIVE');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_DEACTIVATED', entityId: target.id } });
    expect(audit).not.toBeNull();
  });

  it('prevents an admin from deactivating their own account', async () => {
    const res = await deactivateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken)), {
      params: Promise.resolve({ id: adminA.id }),
    });
    expect(res.status).toBe(403);
  });

  it('prevents an admin from changing their own role', async () => {
    const res = await updateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken), {
      role: 'PAYROLL_OPERATOR',
    }), { params: Promise.resolve({ id: adminA.id }) });
    expect(res.status).toBe(403);
  });

  it('does not allow mutating users in another business', async () => {
    const hash = await bcrypt.hash('Pass123', 10);
    const userB = await prisma.user.create({
      data: { email: 'admin-b@test.com', passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: businessB.id },
    });
    const res = await updateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken), {
      role: 'VIEWER',
    }), { params: Promise.resolve({ id: userB.id }) });
    expect(res.status).toBe(404);

    const deact = await deactivateUser(makeRequest('http://localhost/api/users/x', sessionCookie(adminToken)), {
      params: Promise.resolve({ id: userB.id }),
    });
    expect(deact.status).toBe(404);
  });
});