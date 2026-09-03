import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAdmins, POST as postAdmins } from '@/app/api/admin/businesses/[id]/admins/route';
import { PUT as putAdmin, DELETE as deleteAdmin } from '@/app/api/admin/businesses/[id]/admins/[userId]/route';
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

async function routeContext(params: { id: string }) {
  return { params: Promise.resolve(params) } as unknown as { params: Promise<{ id: string }> };
}

async function userContext(params: { id: string; userId: string }) {
  return { params: Promise.resolve(params) } as unknown as { params: Promise<{ id: string; userId: string }> };
}

describe('business admin management', () => {
  let bizA: { id: string };
  let bizB: { id: string };
  let tokenSuper: string;
  let tokenAdminA: string;

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    bizA = await prisma.business.create({ data: { name: 'Biz A' } });
    bizB = await prisma.business.create({ data: { name: 'Biz B' } });
    const adminAHash = await bcrypt.hash('AdminA123', 10);
    const superHash = await bcrypt.hash('SuperTest123', 10);

    const userA = await prisma.user.create({
      data: { email: 'admin-a@test.com', passwordHash: adminAHash, role: 'ADMIN', status: 'ACTIVE', businessId: bizA.id },
    });
    const superUser = await prisma.user.create({
      data: { email: 'super@test.com', passwordHash: superHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });

    tokenSuper = await loginAs(superUser.id);
    tokenAdminA = await loginAs(userA.id);
  }, 30000);

  it('returns 403 for ADMIN (MANAGE_BUSINESSES is SUPER_ADMIN-only)', async () => {
    const res = await getAdmins(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins`, sessionCookie(tokenAdminA)),
      await routeContext({ id: bizA.id })
    );
    expect(res.status).toBe(403);
  }, 30000);

  it('GET lists admins for a business', async () => {
    const res = await getAdmins(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins`, sessionCookie(tokenSuper)),
      await routeContext({ id: bizA.id })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].email).toBe('admin-a@test.com');
    expect(json.data[0].role).toBe('ADMIN');
  }, 30000);

  it('POST creates a new ADMIN for the business', async () => {
    const res = await postAdmins(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins`, sessionCookie(tokenSuper), 'POST', {
        email: 'new-admin@test.com',
        password: 'NewAdmin1',
      }),
      await routeContext({ id: bizA.id })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('new-admin@test.com');
    expect(json.data.role).toBe('ADMIN');
    expect(json.data.businessId).toBe(bizA.id);

    const audit = await prisma.auditLog.findFirst({
      where: { businessId: bizA.id, action: 'USER_CREATED' },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
  }, 30000);

  it('POST rejects a duplicate email with 400', async () => {
    const res = await postAdmins(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins`, sessionCookie(tokenSuper), 'POST', {
        email: 'admin-a@test.com',
        password: 'NewAdmin1',
      }),
      await routeContext({ id: bizA.id })
    );
    expect(res.status).toBe(400);
  }, 30000);

  it('POST returns 404 for an unknown business', async () => {
    const res = await postAdmins(
      makeRequest('http://localhost/api/admin/businesses/nope/admins', sessionCookie(tokenSuper), 'POST', {
        email: 'ghost@test.com',
        password: 'GhostPass1',
      }),
      await routeContext({ id: 'nope' })
    );
    expect(res.status).toBe(404);
  }, 30000);

  it('PUT updates an admin email', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { businessId: bizA.id } });
    const res = await putAdmin(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins/${admin.id}`, sessionCookie(tokenSuper), 'PUT', {
        email: 'updated-admin@test.com',
      }),
      await userContext({ id: bizA.id, userId: admin.id })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.email).toBe('updated-admin@test.com');
  }, 30000);

  it('DELETE deactivates an admin (soft)', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { businessId: bizA.id } });
    const res = await deleteAdmin(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins/${admin.id}`, sessionCookie(tokenSuper), 'DELETE'),
      await userContext({ id: bizA.id, userId: admin.id })
    );
    expect(res.status).toBe(200);
    const refreshed = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(refreshed?.status).toBe('INACTIVE');

    const audit = await prisma.auditLog.findFirst({
      where: { businessId: bizA.id, action: 'USER_DEACTIVATED' },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
  }, 30000);

  it('DELETE returns 400 when admin is already INACTIVE', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { businessId: bizA.id } });
    await prisma.user.update({ where: { id: admin.id }, data: { status: 'INACTIVE' } });

    const res = await deleteAdmin(
      makeRequest(`http://localhost/api/admin/businesses/${bizA.id}/admins/${admin.id}`, sessionCookie(tokenSuper), 'DELETE'),
      await userContext({ id: bizA.id, userId: admin.id })
    );
    expect(res.status).toBe(400);
  }, 30000);

  it('SUPER_ADMIN can manage admins cross-business', async () => {
    const res = await getAdmins(
      makeRequest(`http://localhost/api/admin/businesses/${bizB.id}/admins`, sessionCookie(tokenSuper)),
      await routeContext({ id: bizB.id })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  }, 30000);

  it('PUT returns 404 for admin in a different business', async () => {
    const adminA = await prisma.user.findFirstOrThrow({ where: { businessId: bizA.id } });
    const res = await putAdmin(
      makeRequest(`http://localhost/api/admin/businesses/${bizB.id}/admins/${adminA.id}`, sessionCookie(tokenSuper), 'PUT', {
        email: 'wrong-biz@test.com',
      }),
      await userContext({ id: bizB.id, userId: adminA.id })
    );
    expect(res.status).toBe(404);
  }, 30000);
});
