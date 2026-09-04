import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, encryptPii, decryptPii, decryptPiiArray, PII_FIELDS } from '@/lib/encryption';

function setEncryptionKey(): void {
  // 32 bytes = 64 hex chars
  vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
}

function clearEncryptionKey(): void {
  vi.stubEnv('ENCRYPTION_KEY', '');
}

describe('encryption module', () => {
  describe('encrypt / decrypt round-trip', () => {
    beforeEach(() => setEncryptionKey());
    afterEach(() => clearEncryptionKey());

    it('encrypts and decrypts a string back to the original', () => {
      const plaintext = 'hello world';
      const ciphertext = encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(typeof ciphertext).toBe('string');
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces different ciphertext for the same plaintext (random IV)', () => {
      const a = encrypt('test');
      const b = encrypt('test');
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe('test');
      expect(decrypt(b)).toBe('test');
    });

    it('handles null', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    it('handles empty string', () => {
      const ct = encrypt('');
      expect(decrypt(ct)).toBe('');
    });
  });

  describe('pass-through without key', () => {
    beforeEach(() => clearEncryptionKey());
    afterEach(() => clearEncryptionKey());

    it('returns plaintext as-is when ENCRYPTION_KEY is not set', () => {
      const val = '12345-67890';
      expect(encrypt(val)).toBe(val);
      expect(decrypt(val)).toBe(val);
    });
  });

  describe('encryptPii / decryptPii', () => {
    beforeEach(() => setEncryptionKey());
    afterEach(() => clearEncryptionKey());

    it('encrypts and decrypts all PII fields in a record', () => {
      const record = {
        id: 'emp-001',
        firstName: 'John',
        nationalId: 'NL-12345',
        accountNumber: '123456789',
        taxNumber: 'TPIN-999',
      };

      const encrypted = encryptPii(record);
      expect(encrypted.nationalId).not.toBe('NL-12345');
      expect(encrypted.accountNumber).not.toBe('123456789');
      expect(encrypted.taxNumber).not.toBe('TPIN-999');
      // Non-PII fields untouched
      expect(encrypted.firstName).toBe('John');

      const decrypted = decryptPii(encrypted);
      expect(decrypted.nationalId).toBe('NL-12345');
      expect(decrypted.accountNumber).toBe('123456789');
      expect(decrypted.taxNumber).toBe('TPIN-999');
      expect(decrypted.firstName).toBe('John');
    });

    it('handles null PII fields', () => {
      const record = {
        nationalId: null,
        accountNumber: null,
        taxNumber: null,
      };
      const encrypted = encryptPii(record);
      expect(encrypted.nationalId).toBeNull();
      expect(encrypted.accountNumber).toBeNull();
      expect(encrypted.taxNumber).toBeNull();
    });

    it('handles partial records (missing PII fields)', () => {
      const partial = { accountNumber: encrypt('123'), employeeId: 'EMP001' };
      const decrypted = decryptPii(partial);
      expect(decrypted.accountNumber).toBe('123');
      expect((decrypted as Record<string, unknown>).nationalId).toBeUndefined();
    });
  });

  describe('decryptPiiArray', () => {
    beforeEach(() => setEncryptionKey());
    afterEach(() => clearEncryptionKey());

    it('decrypts PII in an array of records', () => {
      const records = [
        encryptPii({ id: '1', nationalId: 'NL-1', accountNumber: 'A1', taxNumber: 'T1' }),
        encryptPii({ id: '2', nationalId: 'NL-2', accountNumber: 'A2', taxNumber: 'T2' }),
      ];
      const decrypted = decryptPiiArray(records);
      expect(decrypted[0].nationalId).toBe('NL-1');
      expect(decrypted[1].accountNumber).toBe('A2');
    });
  });

  it('has correct PII_FIELDS list', () => {
    expect(PII_FIELDS).toEqual(['nationalId', 'accountNumber', 'taxNumber']);
  });
});
