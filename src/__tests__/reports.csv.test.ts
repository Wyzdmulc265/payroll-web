import { describe, it, expect } from 'vitest';
import { escapeCsvCell, csvField } from '@/lib/csv';

describe('escapeCsvCell', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeCsvCell(null as unknown as string)).toBe('');
    expect(escapeCsvCell(undefined as unknown as string)).toBe('');
  });

  it('escapes formula-injection characters', () => {
    expect(escapeCsvCell('=cmd')).toBe("'=cmd");
    expect(escapeCsvCell('+A1')).toBe("'+A1");
    expect(escapeCsvCell('-A1')).toBe("'-A1");
    expect(escapeCsvCell('@A1')).toBe("'@A1");
    expect(escapeCsvCell('\tTab')).toBe("'\tTab");
    expect(escapeCsvCell('\rCR')).toBe("'\rCR");
  });

  it('passes through safe strings', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
    expect(escapeCsvCell('123')).toBe('123');
    expect(escapeCsvCell('MWK 1,000')).toBe('MWK 1,000');
  });
});

describe('csvField', () => {
  it('wraps value in double quotes', () => {
    expect(csvField('hello')).toBe('"hello"');
  });

  it('escapes internal double quotes', () => {
    expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
  });
});
