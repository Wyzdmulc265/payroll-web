import { describe, expect, it, beforeEach } from 'vitest';
import prisma from '../prisma';
import { hashPassword, verifyPassword } from './password';
import { hasPermission, Permission } from './permissions';
import { checkLoginRateLimit, clearLoginRateLimit } from './rate-limit';
import { canAccessBusiness } from './authorization';
import type { AuthUser } from './types';

const user = (role: AuthUser['role'], businessId: string | null = 'business-a'): AuthUser => ({
  id: 'user-1', email: 'user@example.com', role, status: 'ACTIVE', businessId,
});

describe('password utilities', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const hash = await hashPassword('StrongPass1');
    expect(hash).not.toBe('StrongPass1');
    expect(await verifyPassword('StrongPass1', hash)).toBe(true);
    expect(await verifyPassword('WrongPass1', hash)).toBe(false);
  });
});

describe('permissions and tenant access', () => {
  it('applies role permissions', () => {
    expect(hasPermission('ADMIN', Permission.MANAGE_EMPLOYEES)).toBe(true);
    expect(hasPermission('VIEWER', Permission.MANAGE_EMPLOYEES)).toBe(false);
    expect(hasPermission('PAYROLL_OPERATOR', Permission.RUN_PAYROLL)).toBe(true);
  });

  it('requires the same business and denies implicit super-admin access', () => {
    expect(canAccessBusiness(user('ADMIN'), 'business-a')).toBe(true);
    expect(canAccessBusiness(user('ADMIN'), 'business-b')).toBe(false);
    expect(canAccessBusiness(user('SUPER_ADMIN', null), 'business-a')).toBe(false);
  });
});

describe('login rate limit', () => {
  beforeEach(async () => {
    await prisma.rateLimit.deleteMany();
  });

  it('allows five attempts and blocks the sixth', async () => {
    const key = `test-${Date.now()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await checkLoginRateLimit(key);
      expect(result.allowed).toBe(true);
    }
    const blocked = await checkLoginRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    await clearLoginRateLimit(key);
  }, 15000);
});
