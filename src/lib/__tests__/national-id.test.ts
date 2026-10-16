import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { hashNationalId, nationalIdHashCandidates } from '@/lib/national-id';

const originalEncryptionKey = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe('national ID hashes', () => {
  it('uses a normalized keyed hash and includes legacy hashes during migration', () => {
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);

    const hash = hashNationalId('  ID-123  ');
    const legacy = createHash('sha256').update('id-123').digest('hex');

    expect(hash).toBe(hashNationalId('id-123'));
    expect(hash).not.toBe(legacy);
    expect(nationalIdHashCandidates('ID-123')).toEqual([hash, legacy]);
  });
});