import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../password';
import { passwordSchema } from '../schemas';

describe('password utilities', () => {
  it('produces different hashes for the same password (salt randomness)', async () => {
    const hash1 = await hashPassword('StrongPass1');
    const hash2 = await hashPassword('StrongPass1');
    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword('StrongPass1', hash1)).toBe(true);
    expect(await verifyPassword('StrongPass1', hash2)).toBe(true);
  });

  it('rejects wrong passwords', async () => {
    const hash = await hashPassword('StrongPass1');
    expect(await verifyPassword('WrongPass1', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('enforces password policy via passwordSchema', () => {
    const valid = passwordSchema.safeParse('StrongPass1');
    expect(valid.success).toBe(true);

    const tooShort = passwordSchema.safeParse('Short1');
    expect(tooShort.success).toBe(false);
    if (!tooShort.success) {
      expect(tooShort.error.issues.some(i => i.message === 'Password must be at least 8 characters')).toBe(true);
    }

    const noUpper = passwordSchema.safeParse('lowercase1');
    expect(noUpper.success).toBe(false);
    if (!noUpper.success) {
      expect(noUpper.error.issues.some(i => i.message === 'Password must contain at least one uppercase letter')).toBe(true);
    }

    const noNumber = passwordSchema.safeParse('NoNumbers');
    expect(noNumber.success).toBe(false);
    if (!noNumber.success) {
      expect(noNumber.error.issues.some(i => i.message === 'Password must contain at least one number')).toBe(true);
    }
  });
});
