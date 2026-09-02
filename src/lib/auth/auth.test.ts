import { describe, expect, it } from 'vitest';
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
  it('allows five attempts and blocks the sixth', () => {
    const key = `test-${Date.now()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkLoginRateLimit(key).allowed).toBe(true);
    }
    expect(checkLoginRateLimit(key).allowed).toBe(false);
    clearLoginRateLimit(key);
  });
});
