import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getStats } from '@/app/api/admin/stats/route';
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

describe('admin stats route', () => {
  let tokenSuper: string;
  let tokenAdmin: string;

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

    const biz = await prisma.business.create({ data: { name: 'Stats Biz' } });
    const adminHash = await bcrypt.hash('AdminPass1', 10);
    const superHash = await bcrypt.hash('SuperPass1', 10);

    const admin = await prisma.user.create({
      data: { email: 'admin-stats@test.com', passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE', businessId: biz.id },
    });
    const superUser = await prisma.user.create({
      data: { email: 'super-stats@test.com', passwordHash: superHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });

    const employees = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.employee.create({
          data: {
            employeeId: `EMP${String(i + 1).padStart(3, '0')}`,
            firstName: `Emp`,
            lastName: `${i}`,
            businessId: biz.id,
            department: 'IT',
            position: 'Dev',
            employmentDate: new Date('2025-01-01'),
            basicSalary: 1000,
          },
        })
      )
    );

    await prisma.payrollRecord.createMany({
      data: employees.map((emp, i) => ({
        payrollPeriod: `2026-0${i + 1}`,
        periodStart: new Date(`2026-0${i + 1}-01`),
        periodEnd: new Date(`2026-0${i + 1}-28`),
        employeeId: emp.id,
        businessId: biz.id,
        department: 'IT',
        position: 'Dev',
        basicSalary: 1000,
        allowances: 0,
        grossEarnings: 1000,
        paye: 0,
        pensionEE: 0,
        pensionER: 0,
        tevetLevy: 0,
        totalDeductions: 0,
        netPay: 1000,
        employerCost: 1000,
      })),
    });

    tokenSuper = await loginAs(superUser.id);
    tokenAdmin = await loginAs(admin.id);
  }, 60000);

  it('returns 401 without a session', async () => {
    const res = await getStats(makeRequest('http://localhost/api/admin/stats'));
    expect(res.status).toBe(401);
  }, 30000);

  it('returns 403 for ADMIN (MANAGE_BUSINESSES is SUPER_ADMIN-only)', async () => {
    const res = await getStats(makeRequest('http://localhost/api/admin/stats', sessionCookie(tokenAdmin)));
    expect(res.status).toBe(403);
  }, 30000);

  it('returns counts and recentBusinesses for SUPER_ADMIN', async () => {
    const res = await getStats(makeRequest('http://localhost/api/admin/stats', sessionCookie(tokenSuper)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.counts.businesses).toBe(1);
    expect(json.data.counts.admins).toBe(1);
    expect(json.data.counts.payrollRecords).toBe(5);
    expect(json.data.recentBusinesses).toHaveLength(1);
    expect(json.data.recentBusinesses[0].name).toBe('Stats Biz');
  }, 30000);
});
