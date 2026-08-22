import { describe, expect, it } from 'vitest';
import { coerce } from './useZmConfig';

describe('coerce', () => {
  it('numbers', () => {
    expect(coerce('25', 20)).toBe(25);
    expect(coerce('abc', 20)).toBe(20);
  });
  it('booleans in ZoneMinder spellings', () => {
    expect(coerce('1', false)).toBe(true);
    expect(coerce('yes', false)).toBe(true);
    expect(coerce('0', true)).toBe(false);
    expect(coerce('off', true)).toBe(false);
    expect(coerce('maybe', true)).toBe(true);
  });
  it('strings fall back when empty', () => {
    expect(coerce('', 'x')).toBe('x');
    expect(coerce('%d/%m/%Y', 'x')).toBe('%d/%m/%Y');
  });
});
